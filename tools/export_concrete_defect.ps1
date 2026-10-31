$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $pres = $ppt.Presentations.Open((Resolve-Path "tools/concrete_defect_test.pptx").Path, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
  $slide1 = $pres.Slides.Item(1)
  $out1 = (Resolve-Path "tools").Path + "\concrete_slide1_image4.jpg"
  $slide1.Export($out1, "JPG", 1920, 1080)

  $slide2 = $pres.Slides.Item(2)
  $out2 = (Resolve-Path "tools").Path + "\concrete_slide2_image1.jpg"
  $slide2.Export($out2, "JPG", 1920, 1080)

  $pres.Close()
  Write-Host "Exported slide 1 and slide 2 successfully!"
} catch {
  Write-Host "Error: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) {
    $ppt.Quit()
  }
}
