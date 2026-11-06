$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $pres = $ppt.Presentations.Open((Resolve-Path "tools/single_banner_2_photos.pptx").Path, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
  $slide1 = $pres.Slides.Item(1)
  $out1 = (Resolve-Path "tools").Path + "\single_banner_2_photos_rendered.jpg"
  $slide1.Export($out1, "JPG", 1920, 1080)
  $pres.Close()
  Write-Host "Exported to $out1 successfully!"
} catch {
  Write-Host "Error: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) {
    $ppt.Quit()
  }
}
