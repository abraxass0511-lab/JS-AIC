---
trigger: always_on
description: "Strict protection rules for 템플릿, 표준분류, and 분류표 인자 directories and template assets"
---

# Protected Files and Folders Rule

The following directories and files must NEVER be removed, deleted, overwritten, or cleared:
- `템플릿/`
- `표준분류/`
- `분류표 인자/`
- `SafePatrol_입력인자_분류표.xlsx`
- `SafePatrol_입력인자_분류표_최신.xlsx`
- `부적합 장표.pptx`
- `샘플1_아파트_시스템비계_중부적합.pptx`
- `샘플2_물류센터_개구부덮개_경부적합.pptx`

Any tool call that executes destructive deletion commands (`git clean`, `rm`, `Remove-Item`) on these assets is strictly prohibited.

