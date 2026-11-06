
    $ppt = New-Object -ComObject PowerPoint.Application
    $pres = $ppt.Presentations.Open((Resolve-Path "tools/test_fixed_output.pptx").Path, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
    $slide = $pres.Slides.Item(1)
    $outPath = (Resolve-Path "tools").Path + "\test_fixed_rendered.jpg"
    $slide.Export($outPath, "JPG", 1920, 1080)
    $pres.Close()
    $ppt.Quit()
    Write-Host "Exported tools/test_fixed_rendered.jpg!"
  