$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  Write-Host "PowerPoint COM Object created successfully!"
  $pres = $ppt.Presentations.Open((Resolve-Path "tools/user_exact_case.pptx").Path, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
  $slide = $pres.Slides.Item(1)
  $outPath = (Resolve-Path "tools").Path + "\user_exact_rendered.jpg"
  $slide.Export($outPath, "JPG", 1920, 1080)
  $pres.Close()
  Write-Host "Successfully exported user_exact_rendered.jpg"
} catch {
  Write-Host "Error: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) {
    $ppt.Quit()
  }
}
