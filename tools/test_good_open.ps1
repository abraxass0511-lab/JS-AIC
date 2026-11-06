$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  Copy-Item "tools/test_5_requirements_verified.pptx" "C:/Users/YS/good_test.pptx"
  $pres = $ppt.Presentations.Open("C:\Users\YS\good_test.pptx", -1, 0, 0)
  Write-Host "GOOD TEST OPEN SUCCESS! Slide count: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "GOOD TEST FAILED: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) { $ppt.Quit() }
  Remove-Item "C:/Users/YS/good_test.pptx" -ErrorAction SilentlyContinue
}
