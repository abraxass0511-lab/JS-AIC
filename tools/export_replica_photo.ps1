$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $pres = $ppt.Presentations.Open((Resolve-Path "tools/test_template_replica_photo.pptx").Path, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
  $slide = $pres.Slides.Item(1)
  $outPath = (Resolve-Path "tools").Path + "\replica_photo_rendered.jpg"
  $slide.Export($outPath, "JPG", 1920, 1080)
  $pres.Close()
  Write-Host "Successfully exported replica_photo_rendered.jpg"
} catch {
  Write-Host "Error: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) {
    $ppt.Quit()
  }
}
