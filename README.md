# When Do the Megawatts Arrive?

A public baseline for U.S. power uprate delivery timing. Dataset and code v1.0, October 2026.

León Garcia, Department of Physics, Stanford University (lgarcia3 [at] stanford.edu)

This repository holds the dataset and code behind my talk at the INL Energy Investment Decision Symposium on September 30, 2026. It has two parts:

1. **A dataset of every NRC power uprate approval, 1977 to 2021**: 172 approvals, 164 of them with a review time read from the NRC's own approval letter, each linked to its ADAMS document.
2. **A model of when the uprates on the NRC's expected applications list reach the grid**: review times drawn from the record, installation at refueling outages, 5,000 runs per scenario.

The interactive version, with every chart from the talk, lives at [leonmgarcia.com/uprate](https://leonmgarcia.com/uprate/). Its source is the `docs/` folder of the GitHub repository, [github.com/leongarcia2023/uprate](https://github.com/leongarcia2023/uprate).

## Headline numbers (v1.0)

| | |
|---|---|
| NRC uprate approvals, 1977 to 2021 | 172, adding 24,146 MWt (about 8 GWe) |
| Review times in the dataset | 164: 147 read by the parser and 17 by hand. The 8 microfiche era approvals have no letter to read |
| EPU reviews, 2001 and 2002 | median 11.8 months (9.6 to 16.1, n = 9) |
| EPU reviews, approvals since 2005 | median 22.8 months, and 21 of 22 took 17 to 61 |
| MUR reviews | median 7.0 months before 2010 (n = 44), 11.3 since (n = 29) |
| NRC expected list, September 8, 2026 | 31 filings, 2,421 MWe through 2032, and 17 filings in 2027 |
| Uprates on the grid by the end of 2027 | 0 MWe at historical review times, 17 MWe in the fastest scenario |
| Uprates on the grid by the end of 2029 | 219 MWe (middle 80% of runs: 185 to 554) |
| With the three announced restarts, end of 2029 | 2,469 MWe, 49% of the 5 GWe UPRISE mark |
| Five scenarios, end of 2029, with restarts | 49% to 64% of the mark |

## Run it

The model needs only the Python standard library (3.9 or newer).

```
python3 uprate_baseline.py
```

It reads `data/`, prints the numbers above in about 15 seconds, and writes `results/`. Options:

- `--runs 20000` and `--seed 11` change the Monte Carlo settings.
- `--skip-sensitivity` skips the extra runs behind the sensitivity table.
- `--page-data path/to/uprate_data.js` also writes the data bundle the web page reads.

The date parser needs `pip install -r requirements.txt`.

```
python3 extract_dates.py                          pilot: the ten row pilot from the original run
python3 extract_dates.py --full                   every letter with an ADAMS accession
python3 extract_dates.py --full --pdf-dir letters read PDFs named <accession>.pdf from a folder
```

It writes `results/extracted_dates.csv` and compares each date it reads against the dataset. Four dates I checked by hand before writing the parser have to come back exact, and the script stops if one doesn't. The NRC's site sometimes refuses plain scripted requests. If you install `curl_cffi`, the script uses it, and it waits 4 to 6 seconds between requests either way. With `--pdf-dir` it makes no network requests at all.

## Files

| File | What it holds |
|---|---|
| `data/uprate_approvals_v1.0.csv` | All 172 approvals with review times and provenance |
| `data/nrc_expected_applications_2026-09-08.csv` | The NRC's named list of expected filings (30 rows) |
| `data/nrc_expected_by_year_2026-09-08.csv` | The NRC's summary table of expected filings by year |
| `uprate_baseline.py` | The model and every number in the talk |
| `extract_dates.py` | The parser that reads application dates from approval letters |
| `results/scenarios_by_year.csv` | Delivered uprate MWe by scenario and year: 10th, 50th and 90th percentiles |
| `results/arrival_by_filing.csv` | For each filing and scenario, the share of runs online by the end of 2027, 2029 and 2031 |
| `results/headroom_by_unit.csv` | Approved uprates summed by unit, and the room under each reactor type's 90th percentile |
| `results/summary.json` | The talk's numbers, review time statistics and sensitivity runs |

## Data dictionary

### `uprate_approvals_v1.0.csv`

One row per NRC approval, in the NRC table's order.

| Column | Meaning |
|---|---|
| `event_no` | Row number in the NRC's approved applications table, 1 to 172 |
| `plant` | Unit name as the NRC table gives it |
| `unit` | Normalized unit name for summing across approvals (for example, WNP-2 and Columbia Generating Station are both `Columbia`) |
| `reactor_type` | BWR or PWR |
| `uprate_type` | MUR (measurement uncertainty recapture), Stretch, or EPU (extended power uprate) |
| `uprate_pct` | Uprate size as the NRC table states it, percent of the licensed thermal power at the time |
| `uprate_mwt` | Uprate size in thermal megawatts, from the NRC table |
| `approval_date` | NRC approval date, from the NRC table |
| `application_date` | Original application date cited in the approval letter, blank for the 8 microfiche era rows |
| `review_months` | Approval date minus application date, in months of 30.44 days |
| `date_source` | `parser`, `hand`, or `none` |
| `parser_variant` | For parser rows, which of the eight phrasings matched (see below) |
| `nrc_table_accession` | Accession number in the NRC's table. For 76 rows this is an ADAMS package rather than a letter |
| `letter_accession` | The ADAMS document the date came from |
| `letter_url` | Direct link to that document |
| `note` | For hand read rows, why the parser missed the letter and any judgment call. For package rows, a pointer to the letter |

The eight phrasings, tried in order, each ending in a date such as "March 24, 1977":

| # | Wording | Rows |
|---|---|---|
| 1 | in response to ... application dated DATE (up to 100 characters between, no period) | 129 |
| 2 | in response to your application of DATE | 0 |
| 3 | by application dated DATE | 2 |
| 4 | pursuant to your application dated DATE | 0 |
| 5 | your application dated DATE | 0 |
| 6 | application for amendment dated DATE | 3 |
| 7 | license amendment request (LAR) dated DATE | 0 |
| 8 | letter dated DATE, as supplemented | 13 |

### `nrc_expected_applications_2026-09-08.csv`

| Column | Meaning |
|---|---|
| `list_order` | Order on the NRC page |
| `filing_year`, `filing_quarter` | Planned filing quarter |
| `applicant`, `plant` | As the NRC lists them. The NRC withholds the plant on 13 rows |
| `unit` | Matching `unit` in the approvals file, blank when withheld |
| `uprate_type` | MUR, Stretch or EPU |

### `nrc_expected_by_year_2026-09-08.csv`

The NRC's summary table: filings by year and type, with MWt and MWe. Its MWe values sum to 2,422, but the page prints a total of 2,421. The summary counts 31 filings and the named list has 30 rows. The two disagree in 2026, 2028 and 2030.

## Methods

**Review times.** Every approval letter cites the application it answers, usually as "in response to your application dated ...". The parser downloads each letter from ADAMS and reads that date. The rule: take the original application date, never a supplement. In a letter that bundles several requests, take the request that is the uprate. When the NRC's table points to an ADAMS package, the parser opens the package and finds the letter (73 rows), and I read the other 3 package rows by hand. Review time includes the NRC's requests for more information, the utility's responses, supplements and pauses. It can run short but not long: when a utility withdrew and refiled, the approval letter cites the refiled application.

**Hand reads.** 17 rows. Each carries a note in the dataset: poor scans, a text layer missing the space in "September 8,2010", bundled requests (Shearon Harris 2001), and wording outside the eight phrasings ("your letters dated", "your submittal dated").

**The delivery model.**

- Filings: the NRC's named list, each filed at the middle of its listed quarter.
- Megawatts per filing: the NRC publishes MWe by year only. I assign 17 MWe to each MUR (about 1.5% of a typical unit) and 50 to each stretch, and the EPUs split the rest of each year's total. This assumption moves the 2029 result more than any other.
- Review time: a random draw from approvals since 2010 for MURs (29 reviews) and EPUs (14). No stretch uprate has been approved since 2008, so stretch filings draw from all 57 stretch reviews.
- NRC targets scenario: the targets from the NRC's May 7, 2024 letter to NEI (6, 9 and 12 months), plus 2 months for acceptance review, times a uniform factor from 0.75 to 1.25.
- Installation: uniform from 3 to 15 months after approval for a MUR or stretch, and 9 to 30 for an EPU. The faster and slower scenarios shift both ends by 6 months (floored at 1 and 2 months). EIA generator records put the step up at Grand Gulf, Browns Ferry and Peach Bottom about a year after approval and Nine Mile Point 2 at about two, in phases. Four plants anchor these windows but can't define a distribution.
- Restarts: Palisades (800 MWe), Crane (835) and Duane Arnold (615) at company guidance, counted at 60% in 2027 and in full from 2028. They never go through the review chain.
- 5,000 runs per scenario, seed 7. Percentiles are order statistics of the sorted runs.

**Headroom.** I sum each unit's approved uprate percentages and compare the sum with the 90th percentile for its reactor type: 20.0% for BWRs (33 units) and 11.7% for PWRs (68 units). Closed units and the three restart units stay off the charts but count toward the percentiles. The NRC states each uprate against the power licensed at the time, so the sum slightly understates the compounded total. This is a proxy: design margins, steam dryers and the turbine generator set the real limit, and the PWR line mostly reflects how few PWR EPUs have been licensed.

## Limits

- Runs treat reviews as independent. A real slowdown would hit every filing at once, so the 80% bands are too narrow. The spread across scenarios is the better statement of uncertainty.
- There is no review queue. The historical case assumes reviews keep their speed with 17 filings in 2027.
- Capacity that needs no uprate review, such as a more efficient turbine at the same thermal power, is outside the model.
- Megawatts follow the NRC's thermal to electric conversion. Supply chain limits are not modeled.
- These are base rates, not a forecast for any one plant.

## Sensitivity (end of 2029, historical reviews)

| Change | Uprates, median | With restarts |
|---|---|---|
| Base case | 219 MWe | 49% |
| Reviews drawn from the whole 1977 to 2021 record | 419 MWe | 53% |
| Each year's MWe split evenly across its filings | 463 MWe | 54% |
| Seeds 1 to 20 | 219 to 236 MWe | 49% to 50% |
| 20,000 runs | 219 MWe | 49% |
| Palisades or Crane misses 2029 | 219 MWe | 33% |
| Duane Arnold misses 2029 | 219 MWe | 37% |

## Sources

- NRC, Approved Applications for Power Uprates: https://www.nrc.gov/reactors/operating/licensing/power-uprates/status-power-apps/approved-applications.html
- NRC, Expected Applications for Power Uprates (updated September 8, 2026): https://www.nrc.gov/reactors/operating/licensing/power-uprates/status-power-apps/expected-applications.html
- NRC, Pending Applications for Power Uprates (none as of September 15, 2026): https://www.nrc.gov/reactors/operating/licensing/power-uprates/status-power-apps/pending-applications.html
- NRC letter to NEI on uprate review targets, May 7, 2024 (ML24106A068): https://www.nrc.gov/docs/ML2410/ML24106A068.pdf
- Every approval letter: https://www.nrc.gov/docs/ via the `letter_url` column

## License and citation

Copyright © 2026 León Garcia.

Code (the Python scripts, and the web page in the repository's `docs/` folder): MIT, see `LICENSE`. Data (`data/` and `results/`): CC BY 4.0, see `LICENSE-DATA.md`. The NRC records underneath are public.

The web page also uses material under other licenses. The plant photos come from Wikimedia Commons, and `docs/assets/plants/CREDITS.md` credits each one with its license. The plant summaries come from Wikipedia under CC BY-SA 4.0. Plotly.js is MIT licensed, and the Computer Modern Unicode fonts are under the SIL Open Font License in `docs/assets/fonts/OFL.txt`.

Garcia, León. *When Do the Megawatts Arrive? A Public Baseline for U.S. Power Uprate Delivery Timing.* Dataset and code v1.0, October 2026. leonmgarcia.com/uprate.

## Updates

I refresh the expected list each quarter, and the next refresh is December 2026. If you find a wrong date, email lgarcia3 [at] stanford.edu with the event number and I'll fix it in the next release.

Independent work built from public records. It doesn't speak for INL, DOE or the NRC.
