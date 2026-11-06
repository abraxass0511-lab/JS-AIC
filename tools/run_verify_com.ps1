
$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $pres = $ppt.Presentations.Open('C:\Users\YS\verified_user_slide.pptx', -1, 0, 0)
  Write-Host "POWERPOINT COM OPEN SUCCESS! Slide count: $($pres.Slides.Count)"
  $slide = $pres.Slides.Item(1)
  $slide.Export('C:\Users\YS\verified_user_slide_rendered.jpg', 'JPG', 1920, 1080)
  Write-Host "Exported rendered image successfully!"
  $pres.Close()
} catch {
  Write-Host "POWERPOINT COM OPEN FAILED: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) { $ppt.Quit() }
  [System.GC]::Collect()
}
