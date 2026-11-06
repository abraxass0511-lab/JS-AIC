
$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $p = (Resolve-Path "tools/exact_test.pptx").Path
  Write-Host "Opening: $p"
  $pres = $ppt.Presentations.Open($p, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
  Write-Host "OPEN SUCCESS! Slides: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "OPEN FAILED: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) { $ppt.Quit() }
  [System.GC]::Collect()
}
