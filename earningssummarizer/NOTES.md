# Notes

## Mental model
- Press releases are the source of truth.
- Summaries are translations.
- Tests enforce numeric integrity and required coverage.

## Testing policy
- Summary numbers must be a subset of source numbers.
- Required metrics must be included when present.

## Future improvements
- Add more fixtures (AAPL, NVDA, MSFT) to broaden coverage.
- Add unit normalization (million vs. billion).
- Add missing-metric debugging in summary generator.
