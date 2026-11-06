$ppt = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $path = (Resolve-Path "tools/test_user_record_corrupt.pptx").Path
  Write-Host "Resolved path: $path"
  $pres = $ppt.Presentations.Open($path, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
  Write-Host "COM OPEN SUCCESS! Slide count: $($pres.Slides.Count)"
  $pres.Close()
} catch {
  Write-Host "COM OPEN FAILED: $($_.Exception.Message)"
} finally {
  if ($ppt -ne $null) { $ppt.Quit() }
  [System.GC]::Collect()
}