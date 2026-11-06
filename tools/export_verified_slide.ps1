$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $pres = $ppt.Presentations.Open((Resolve-Path "tools/verified_all_improvements.pptx").Path, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
  $slide = $pres.Slides.Item(1)
  $outPath = (Resolve-Path "tools").Path + "\verified_slide1_rendered.jpg"
  $slide.Export($outPath, "JPG", 1920, 1080)
  $pres.Close()
  Write-Host "Exported verified_slide1_rendered.jpg successfully!"
} catch {
  Write-Host "Error: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) {
    $ppt.Quit()
  }
}

