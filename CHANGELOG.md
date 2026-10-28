# Changelog

## 0.2.1 — 2026-10-29

### Changed

- Both plugin surfaces now speak the host's card language. The API-key row page
  and the native-provider card share one hairline card
  (`--dsw-alias-border-l2`, `--dsw-radius-lg`, 14px padding, 10px gap) around a
  sunken body (`--dsw-alias-interactive-bg-hover`, `--dsw-radius-md`, 12px
  padding): a 13px/600 title with a 12px/1.5 tertiary hint, the editable field
  inside the card, and Save after it with Clear as a quiet 12px text action.
- The provider card keeps its title row and moves the state into one lead line,
  a native description-list facts grid (max-content label column, baseline
  alignment, 14px column gap) and one note — the same structure the host's
  status cards use.
- Every colour, radius and border is a host token. No hex fallback, and the
  page's class names carry this package's prefix so they cannot claim another
  plugin's namespace.
