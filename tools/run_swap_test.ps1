
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $pres = $ppt.Presentations.Open("C:\Users\YS\test_slide1_swap.pptx", -1, 0, 0)
  Write-Host "SWAP TEST OPEN SUCCESS! Slides: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "SWAP TEST FAILED: $($_.Exception.Message)"
} finally {
  $ppt.Quit()
  Remove-Item "C:/Users/YS/test_slide1_swap.pptx" -ErrorAction SilentlyContinue
}
