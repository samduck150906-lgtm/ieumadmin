# 관리자 웹(admin-web)만 Netlify에 배포
# 사용법: admin-web 폴더에서 .\deploy-netlify.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$netlify = Get-Command netlify -ErrorAction SilentlyContinue
if (-not $netlify) {
    Write-Host "Netlify CLI가 없습니다. 설치: npm install -g netlify-cli"
    npm install -g netlify-cli
}

Write-Host "[관리자 웹] Netlify 배포 (이 폴더 = admin-web)"
netlify deploy --prod --build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "1. netlify login"
    Write-Host "2. netlify link  → 관리자용 Netlify 사이트 선택 (랜딩과 다른 사이트)"
    Write-Host "3. 환경 변수: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY"
    exit 1
}
