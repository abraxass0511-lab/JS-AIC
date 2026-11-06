
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $pres = $ppt.Presentations.Open('C:\Users\YS\test_fixed_user_record.pptx', -1, 0, 0)
  Write-Host "COM OPEN SUCCESS! Slide count: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "COM OPEN FAILED: $($_.Exception.Message)"
} finally {
  $ppt.Quit()
  Remove-Item 'C:/Users/YS/test_fixed_user_record.pptx' -ErrorAction SilentlyContinue
}
