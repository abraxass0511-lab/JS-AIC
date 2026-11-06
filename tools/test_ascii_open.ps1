Copy-Item "tools/exact_test.pptx" "C:/Users/YS/exact_test.pptx"
$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $pres = $ppt.Presentations.Open("C:\Users\YS\exact_test.pptx", -1, 0, 0)
  Write-Host "PURE ASCII PATH OPEN SUCCESS! Slide count: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "PURE ASCII PATH FAILED: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) { $ppt.Quit() }
  Remove-Item "C:/Users/YS/exact_test.pptx" -ErrorAction SilentlyContinue
}
