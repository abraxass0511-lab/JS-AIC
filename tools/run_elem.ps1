
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $pres = $ppt.Presentations.Open("C:\Users\YS\test_elem.pptx", -1, 0, 0)
  Write-Host "OPEN SUCCESS! Slides: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "OPEN FAILED: $($_.Exception.Message)"
} finally {
  $ppt.Quit()
  Remove-Item "C:/Users/YS/test_elem.pptx" -ErrorAction SilentlyContinue
}
