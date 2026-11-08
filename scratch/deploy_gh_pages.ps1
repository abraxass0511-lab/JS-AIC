$ErrorActionPreference = "Stop"

# [절대 보호 장치 1: 사전 무결성 검증]
$protectedFolders = @("템플릿", "표준분류", "분류표 인자")
foreach ($folder in $protectedFolders) {
    if (-not (Test-Path $folder) -or (Get-ChildItem -Path $folder).Count -eq 0) {
        throw "CRITICAL SECURITY ERROR: Protected folder '$folder' is missing or empty! Halting deployment immediately."
    }
}

Write-Host "Creating worktree for gh-pages..."
git worktree add "..\gh-pages-work" gh-pages

Write-Host "Copying app files to gh-pages-work root and app..."
Copy-Item -Path "app\*" -Destination "..\gh-pages-work\" -Recurse -Force
Copy-Item -Path "app\*" -Destination "..\gh-pages-work\app\" -Recurse -Force

# gh-pages 브랜치에도 보호 폴더들을 안전하게 동기화 복사
Copy-Item -Path "템플릿" -Destination "..\gh-pages-work\" -Recurse -Force
Copy-Item -Path "표준분류" -Destination "..\gh-pages-work\" -Recurse -Force
Copy-Item -Path "분류표 인자" -Destination "..\gh-pages-work\" -Recurse -Force

Write-Host "Staging and committing in gh-pages-work..."
Push-Location "..\gh-pages-work"
try {
    git status --short
    git add -A
    git commit -m "Deploy: sync app and permanently protect 템플릿, 표준분류, 분류표 인자 assets"
    git push origin gh-pages
} finally {
    Pop-Location
}

Write-Host "Removing worktree..."
git worktree remove --force "..\gh-pages-work"

# [절대 보호 장치 2: 사후 무결성 검증]
foreach ($folder in $protectedFolders) {
    if (-not (Test-Path $folder) -or (Get-ChildItem -Path $folder).Count -eq 0) {
        throw "CRITICAL POST-CHECK ERROR: Protected folder '$folder' was affected! Check filesystem immediately."
    }
}

Write-Host "Deployment completed successfully with 100% protected folder integrity!"
