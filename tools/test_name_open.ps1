
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $path = (Resolve-Path -LiteralPath 'C:\Users\YS\Desktop\안티그래피티\JS AIC\tools\점검장표_테스트2_2층 하역장 상부 바닥 개구부_2026-10-11.pptx').Path
  Write-Host "Resolved: $path"
  $pres = $ppt.Presentations.Open($path, -1, 0, 0)
  Write-Host "OPEN SUCCESS! Slides: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "OPEN FAILED: $($_.Exception.Message)"
} finally {
  $ppt.Quit()
  [System.GC]::Collect()
}
