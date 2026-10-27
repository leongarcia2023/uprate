import argparse
import csv
import datetime as dt
import json
import os
import random
import statistics
from collections import Counter

TYPES = ("MUR", "Stretch", "EPU")
TARGET_MONTHS = {"MUR": 6, "Stretch": 9, "EPU": 12}
ACCEPTANCE_MONTHS = 2
TARGET_SPREAD = (0.75, 1.25)
INSTALL_WINDOW = {"MUR": (3, 15), "Stretch": (3, 15), "EPU": (9, 30)}
TYPICAL_MWE = {"MUR": 17.0, "Stretch": 50.0}
QUARTER_MID = {1: (2, 15), 2: (5, 15), 3: (8, 15), 4: (11, 15)}
DAYS_PER_MONTH = 30.44
RESTARTS = {"Palisades": 800, "Crane": 835, "Duane Arnold": 615}
RESTART_SHARE = {2026: 0.0, 2027: 0.6}
MARKS = {2027: 2500, 2029: 5000}
YEARS = tuple(range(2026, 2036))
MODERN_SINCE = 2010
SCENARIOS = (
    ("historical", "Historical reviews, typical installation", "historical", 0),
    ("fast", "Historical reviews, installation 6 months sooner", "historical", -6),
    ("slow", "Historical reviews, installation 6 months later", "historical", 6),
    ("targets", "NRC targets met, typical installation", "targets", 0),
    ("targets_fast", "NRC targets met, installation 6 months sooner", "targets", -6),
)
CLOSED_UNITS = ("Vermont Yankee", "Pilgrim", "Kewaunee", "Crystal River", "San Onofre", "Fort Calhoun",
                "Indian Point", "Oyster Creek")
RESTART_UNITS = ("Palisades", "Duane Arnold", "TMI-1")


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_approvals(path):
    rows = []
    for r in read_csv(path):
        r["event_no"] = int(r["event_no"])
        r["uprate_pct"] = float(r["uprate_pct"])
        r["uprate_mwt"] = float(r["uprate_mwt"])
        r["approval_date"] = dt.date.fromisoformat(r["approval_date"])
        r["application_date"] = dt.date.fromisoformat(r["application_date"]) if r["application_date"] else None
        r["review_months"] = float(r["review_months"]) if r["review_months"] else None
        rows.append(r)
    return sorted(rows, key=lambda r: r["event_no"])


def load_expected(named_path, by_year_path):
    named = []
    for r in read_csv(named_path):
        r["list_order"] = int(r["list_order"])
        r["filing_year"] = int(r["filing_year"])
        r["filing_quarter"] = int(r["filing_quarter"])
        named.append(r)
    by_year = [{k: int(v) for k, v in r.items()} for r in read_csv(by_year_path)]
    totals = {r["filing_year"]: float(r["mwe"]) for r in by_year}
    return sorted(named, key=lambda r: r["list_order"]), totals, by_year


def allocate(named, totals, mur_mwe=TYPICAL_MWE["MUR"], stretch_mwe=TYPICAL_MWE["Stretch"], split="type"):
    sizes = {"MUR": mur_mwe, "Stretch": stretch_mwe}
    apps = []
    for year in sorted({n["filing_year"] for n in named}):
        rows = [n for n in named if n["filing_year"] == year]
        if split == "even":
            each = dict.fromkeys(TYPES, totals[year] / len(rows))
        else:
            fixed = sum(sizes[n["uprate_type"]] for n in rows if n["uprate_type"] in sizes)
            n_epu = sum(1 for n in rows if n["uprate_type"] == "EPU")
            each = dict(sizes, EPU=(totals[year] - fixed) / n_epu if n_epu else 0.0)
        for n in rows:
            filed = dt.date(year, *QUARTER_MID[n["filing_quarter"]])
            apps.append(dict(n, mwe=each[n["uprate_type"]], filed=filed))
    return apps


def review_pools(approvals, since=MODERN_SINCE):
    pools = {}
    for t in TYPES:
        timed = [a for a in approvals if a["uprate_type"] == t and a["review_months"] is not None]
        recent = [a["review_months"] for a in timed if since is not None and a["approval_date"].year >= since]
        pools[t] = recent or [a["review_months"] for a in timed]
    return pools


def review_sampler(kind, pools, scale=1.0):
    if kind == "historical":
        return lambda rng, t: scale * rng.choice(pools[t])
    if kind == "targets":
        return lambda rng, t: (TARGET_MONTHS[t] + ACCEPTANCE_MONTHS) * rng.uniform(*TARGET_SPREAD)
    raise ValueError(kind)


def install_window(t, shift):
    lo, hi = INSTALL_WINDOW[t]
    return max(lo + shift, 1), max(hi + shift, 2)


def percentile(sorted_values, q):
    return sorted_values[int(q * (len(sorted_values) - 1))]


def simulate(apps, draw_review, shift=0, runs=5000, seed=7, years=YEARS):
    rng = random.Random(seed)
    cumulative = {y: [] for y in years}
    arrival_year = [Counter() for _ in apps]
    lead_months = {t: [] for t in TYPES}
    for _ in range(runs):
        added = dict.fromkeys(years, 0.0)
        for i, a in enumerate(apps):
            review = draw_review(rng, a["uprate_type"])
            install = rng.uniform(*install_window(a["uprate_type"], shift))
            online = a["filed"] + dt.timedelta(days=(review + install) * DAYS_PER_MONTH)
            arrival_year[i][online.year] += 1
            lead_months[a["uprate_type"]].append(review + install)
            if online.year in added:
                added[online.year] += a["mwe"]
        running = 0.0
        for y in years:
            running += added[y]
            cumulative[y].append(running)
    bands = {}
    for y in years:
        xs = sorted(cumulative[y])
        bands[y] = dict(p10=percentile(xs, 0.1), p50=percentile(xs, 0.5), p90=percentile(xs, 0.9),
                        mean=sum(xs) / len(xs))
    by_end_of = []
    for counts in arrival_year:
        by_end_of.append({y: sum(n for yr, n in counts.items() if yr <= y) / runs for y in years})
    lead = {t: statistics.median(v) for t, v in lead_months.items() if v}
    return dict(bands=bands, by_end_of=by_end_of, lead_median=lead)


def restarts_in(year, restarts=RESTARTS):
    share = RESTART_SHARE.get(year, 1.0 if year > 2027 else 0.0)
    return share * sum(restarts.values())


def run_scenarios(apps, pools, runs=5000, seed=7):
    out = {}
    for key, label, kind, shift in SCENARIOS:
        out[key] = dict(label=label, review=kind, install_shift=shift,
                        **simulate(apps, review_sampler(kind, pools), shift, runs, seed))
    return out


def unit_headroom(approvals, named):
    totals, history = {}, {}
    for a in approvals:
        u = a["unit"]
        totals[u] = totals.get(u, 0.0) + a["uprate_pct"]
        history.setdefault(u, []).append(a)
    kind = {u: history[u][0]["reactor_type"] for u in totals}
    ceiling = {}
    for t in ("BWR", "PWR"):
        values = [v for u, v in totals.items() if kind[u] == t]
        ceiling[t] = dict(p90=statistics.quantiles(values, n=10, method="inclusive")[8], units=len(values))
    listed = {}
    for n in named:
        if n["unit"]:
            listed.setdefault(n["unit"], []).append(f"{n['uprate_type']} Q{n['filing_quarter']} {n['filing_year']}")
    rows = []
    for u, v in totals.items():
        status = "closed" if any(c in u for c in CLOSED_UNITS) else "restart" if any(r in u for r in RESTART_UNITS) else "operating"
        rows.append(dict(unit=u, reactor_type=kind[u], status=status, cumulative_pct=round(v, 2),
                         ceiling_pct=round(ceiling[kind[u]]["p90"], 2),
                         headroom_pct=round(max(ceiling[kind[u]]["p90"] - v, 0.0), 2),
                         uprates=len(history[u]), nrc_expected=listed.get(u, []),
                         history=[dict(type=a["uprate_type"], pct=a["uprate_pct"], approved=a["approval_date"].isoformat())
                                  for a in history[u]]))
    rows.sort(key=lambda r: (-r["headroom_pct"], r["unit"]))
    return rows, ceiling


def describe(values):
    values = sorted(values)
    return dict(n=len(values), min=values[0], median=statistics.median(values), max=values[-1])


def review_facts(approvals):
    timed = [a for a in approvals if a["review_months"] is not None]
    pick = lambda t, lo=None, hi=None: [a["review_months"] for a in timed if a["uprate_type"] == t
                                        and (lo is None or a["approval_date"].year >= lo)
                                        and (hi is None or a["approval_date"].year <= hi)]
    epu_2005 = [a for a in timed if a["uprate_type"] == "EPU" and a["approval_date"].year >= 2005]
    return dict(
        approvals=len(approvals), total_mwt=round(sum(a["uprate_mwt"] for a in approvals), 1),
        review_times=len(timed), parser=sum(a["date_source"] == "parser" for a in approvals),
        hand=sum(a["date_source"] == "hand" for a in approvals), microfiche=sum(a["date_source"] == "none" for a in approvals),
        first_approval=min(a["approval_date"] for a in approvals).isoformat(),
        last_approval=max(a["approval_date"] for a in approvals).isoformat(),
        last_epu=max(a["approval_date"] for a in approvals if a["uprate_type"] == "EPU").isoformat(),
        approvals_2001_2002=dict(Counter(a["uprate_type"] for a in approvals if a["approval_date"].year in (2001, 2002))),
        epu_wave_2001_2002=describe(pick("EPU", 2001, 2002)),
        epu_since_2005=describe(pick("EPU", 2005)),
        epu_since_2005_at_least_17=sum(a["review_months"] >= 17 for a in epu_2005),
        epu_since_2005_bwr=describe([a["review_months"] for a in epu_2005 if a["reactor_type"] == "BWR"]),
        mur_before_2010=describe(pick("MUR", None, 2009)), mur_since_2010=describe(pick("MUR", 2010)),
        epu_since_2010=describe(pick("EPU", 2010)), stretch_all=describe(pick("Stretch")),
    )


def summarize(scenarios, apps, ceiling, facts, sensitivity):
    s = {k: v["bands"] for k, v in scenarios.items()}
    by_2029 = {}
    for k, v in s.items():
        up = v[2029]["p50"]
        by_2029[k] = dict(p10=round(v[2029]["p10"]), p50=round(up), p90=round(v[2029]["p90"]),
                          with_restarts=round(up + restarts_in(2029)),
                          share_of_mark=round(100 * (up + restarts_in(2029)) / MARKS[2029]))
    base = s["historical"][2029]["p50"]
    restart_misses = {name: round(100 * (base + restarts_in(2029) - mwe) / MARKS[2029]) for name, mwe in RESTARTS.items()}
    first = next(i for i, a in enumerate(apps) if a["filing_year"] == 2026)
    return dict(
        facts=facts,
        pipeline=dict(applications_named=len(apps), mwe_by_year=round(sum(a["mwe"] for a in apps))),
        uprates_2029=by_2029,
        uprates_2027={k: dict(p10=round(v[2027]["p10"]), p50=round(v[2027]["p50"]), p90=round(v[2027]["p90"])) for k, v in s.items()},
        targets_gain_2029=round(s["targets"][2029]["p50"] - base),
        restarts=dict(RESTARTS, total=sum(RESTARTS.values()), counted_2027=restarts_in(2027)),
        share_if_one_restart_misses_2029=restart_misses,
        first_epu_2026_by_2029=round(scenarios["historical"]["by_end_of"][first][2029], 3),
        filing_to_power_median_months={t: round(m, 1) for t, m in scenarios["historical"]["lead_median"].items()},
        headroom_ceiling={t: dict(p90=round(c["p90"], 2), units=c["units"]) for t, c in ceiling.items()},
        sensitivity=sensitivity,
    )


def sensitivity_runs(approvals, named, totals, runs, seed):
    apps = allocate(named, totals)
    out = {}
    whole = simulate(apps, review_sampler("historical", review_pools(approvals, since=None)), 0, runs, seed)["bands"][2029]["p50"]
    out["whole_record_reviews"] = dict(p50=round(whole), share_of_mark=round(100 * (whole + restarts_in(2029)) / MARKS[2029]))
    even = allocate(named, totals, split="even")
    out["even_mwe_split"] = {k: round(simulate(even, review_sampler(kind, review_pools(approvals)), shift, runs, seed)["bands"][2029]["p50"])
                             for k, _, kind, shift in SCENARIOS[:3]}
    pools = review_pools(approvals)
    seeds = {s: round(simulate(apps, review_sampler("historical", pools), 0, runs, s)["bands"][2029]["p50"]) for s in range(1, 21)}
    out["seeds_1_to_20"] = dict(min=min(seeds.values()), max=max(seeds.values()), values=sorted(Counter(seeds.values()).items()))
    out["runs_20000"] = round(simulate(apps, review_sampler("historical", pools), 0, 20000, seed)["bands"][2029]["p50"])
    return out


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def export(out_dir, scenarios, apps, headroom, summary):
    os.makedirs(out_dir, exist_ok=True)
    write_csv(os.path.join(out_dir, "scenarios_by_year.csv"),
              ["scenario", "year", "uprates_p10_mwe", "uprates_p50_mwe", "uprates_p90_mwe", "restarts_mwe", "total_p50_mwe"],
              [[k, y, round(b["p10"]), round(b["p50"]), round(b["p90"]), round(restarts_in(y)), round(b["p50"] + restarts_in(y))]
               for k, v in scenarios.items() for y, b in v["bands"].items()])
    write_csv(os.path.join(out_dir, "arrival_by_filing.csv"),
              ["list_order", "filing_year", "filing_quarter", "applicant", "plant", "uprate_type", "model_mwe", "scenario",
               "share_online_by_end_2027", "share_online_by_end_2029", "share_online_by_end_2031"],
              [[a["list_order"], a["filing_year"], a["filing_quarter"], a["applicant"], a["plant"], a["uprate_type"],
                round(a["mwe"], 1), k, round(v["by_end_of"][i][2027], 4), round(v["by_end_of"][i][2029], 4),
                round(v["by_end_of"][i][2031], 4)]
               for k, v in scenarios.items() for i, a in enumerate(apps)])
    write_csv(os.path.join(out_dir, "headroom_by_unit.csv"),
              ["unit", "reactor_type", "status", "uprates", "cumulative_pct", "ceiling_pct", "headroom_pct", "nrc_expected"],
              [[h["unit"], h["reactor_type"], h["status"], h["uprates"], h["cumulative_pct"], h["ceiling_pct"],
                h["headroom_pct"], "; ".join(h["nrc_expected"])] for h in headroom])
    with open(os.path.join(out_dir, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)


def page_bundle(path, approvals, apps, by_year, scenarios, headroom, summary, runs, seed):
    bundle = dict(
        version="1.0", nrc_list_date="2026-09-08", runs=runs, seed=seed,
        approvals=[dict(no=a["event_no"], plant=a["plant"], unit=a["unit"], rx=a["reactor_type"], type=a["uprate_type"],
                        pct=a["uprate_pct"], mwt=a["uprate_mwt"], approved=a["approval_date"].isoformat(),
                        applied=a["application_date"].isoformat() if a["application_date"] else None,
                        months=a["review_months"], source=a["date_source"], variant=a["parser_variant"],
                        acc=a["nrc_table_accession"], letter=a["letter_accession"], url=a["letter_url"], note=a["note"])
                   for a in approvals],
        expected=[dict(order=a["list_order"], year=a["filing_year"], q=a["filing_quarter"], applicant=a["applicant"],
                       plant=a["plant"], unit=a["unit"], type=a["uprate_type"], mwe=a["mwe"], filed=a["filed"].isoformat())
                  for a in apps],
        expected_by_year=by_year,
        params=dict(target_months=TARGET_MONTHS, acceptance_months=ACCEPTANCE_MONTHS, target_spread=TARGET_SPREAD,
                    install_window=INSTALL_WINDOW, typical_mwe=TYPICAL_MWE, quarter_mid=QUARTER_MID,
                    days_per_month=DAYS_PER_MONTH, restarts=RESTARTS, restart_share=RESTART_SHARE, marks=MARKS,
                    years=YEARS, modern_since=MODERN_SINCE),
        scenarios={k: dict(label=v["label"], review=v["review"], install_shift=v["install_shift"],
                           bands={str(y): {q: round(b[q], 1) for q in ("p10", "p50", "p90")} for y, b in v["bands"].items()},
                           by_end_of=[{str(y): round(p, 4) for y, p in d.items()} for d in v["by_end_of"]],
                           lead_median={t: round(m, 2) for t, m in v["lead_median"].items()})
                   for k, v in scenarios.items()},
        headroom=headroom,
        summary=summary,
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("window.UPRATE = ")
        json.dump(bundle, f, separators=(",", ":"))
        f.write(";\n")


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(here, "data"))
    ap.add_argument("--out", default=os.path.join(here, "results"))
    ap.add_argument("--runs", type=int, default=5000)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--page-data", default=None)
    ap.add_argument("--skip-sensitivity", action="store_true")
    args = ap.parse_args()

    approvals = load_approvals(os.path.join(args.data, "uprate_approvals_v1.0.csv"))
    named, totals, by_year = load_expected(os.path.join(args.data, "nrc_expected_applications_2026-09-08.csv"),
                                           os.path.join(args.data, "nrc_expected_by_year_2026-09-08.csv"))
    apps = allocate(named, totals)
    pools = review_pools(approvals)
    scenarios = run_scenarios(apps, pools, args.runs, args.seed)
    headroom, ceiling = unit_headroom(approvals, named)
    facts = review_facts(approvals)
    sensitivity = {} if args.skip_sensitivity else sensitivity_runs(approvals, named, totals, args.runs, args.seed)
    summary = summarize(scenarios, apps, ceiling, facts, sensitivity)
    export(args.out, scenarios, apps, headroom, summary)
    if args.page_data:
        page_bundle(args.page_data, approvals, apps, by_year, scenarios, headroom, summary, args.runs, args.seed)

    print(f"{facts['approvals']} approvals, {facts['total_mwt']:,.0f} MWt, {facts['review_times']} review times "
          f"({facts['parser']} parser, {facts['hand']} hand, {facts['microfiche']} microfiche excluded)")
    print(f"pipeline: {len(apps)} named filings carrying {summary['pipeline']['mwe_by_year']:,} MWe")
    for k, label, _, _ in SCENARIOS:
        u = summary["uprates_2029"][k]
        print(f"{label:<50} 2027 {summary['uprates_2027'][k]['p50']:>4}  2029 {u['p50']:>4} "
              f"({u['p10']} to {u['p90']})  with restarts {u['with_restarts']:,} = {u['share_of_mark']}% of 5 GWe")
    print("headroom ceiling:", {t: c["p90"] for t, c in summary["headroom_ceiling"].items()})
    print("filing to power, median months:", summary["filing_to_power_median_months"])
    if sensitivity:
        print("sensitivity:", json.dumps(sensitivity))


if __name__ == "__main__":
    main()
