# AGENT GUIDELINES & PROTECTED REPOSITORY ASSETS

> [!CAUTION]
> **STRICT REPOSITORY PROTECTION MANDATE**
> Under NO circumstances should any AI agent delete, remove, overwrite, prune, clean, or move the following directories and files.
> They are mission-critical reference templates and classification datasets.

## Protected Directories and Files
1. `템플릿/` (All 7 .pptx and .jpg template files)
2. `표준분류/` (All 17 safety taxonomy images)
3. `분류표 인자/` (All 17 safety taxonomy images)
4. `SafePatrol_입력인자_분류표.xlsx`
5. `SafePatrol_입력인자_분류표_최신.xlsx`
6. `부적합 장표.pptx`
7. `샘플1_아파트_시스템비계_중부적합.pptx`
8. `샘플2_물류센터_개구부덮개_경부적합.pptx`

## Prohibited Commands
- `git clean -f`, `git clean -fd`, `git clean -xdf`
- Direct branch checkout (`git checkout <other-branch>`) inside the primary workspace
- Recursive deletion of workspace directories without explicit user confirmation
