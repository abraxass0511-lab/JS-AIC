$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $pres = $ppt.Presentations.Open((Resolve-Path "tools/verified_all_10_requests.pptx").Path, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
  for ($i = 1; $i -le $pres.Slides.Count; $i++) {
    $slide = $pres.Slides.Item($i)
    $outPath = (Resolve-Path "tools").Path + "\verified_slide_${i}.jpg"
    $slide.Export($outPath, "JPG", 1920, 1080)
    Write-Host "Exported Slide $i -> $outPath"
  }
  $pres.Close()
} catch {
  Write-Host "Error: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) {
    $ppt.Quit()
  }
}
