# Run the seats table migration directly via Supabase REST API
# This creates the seats table needed for team management

Write-Host "Running seats table migration..." -ForegroundColor Yellow

# Load environment variables
$envContent = Get-Content .env.local
$supabaseUrl = ($envContent | Select-String "NEXT_PUBLIC_SUPABASE_URL=(.+)").Matches.Groups[1].Value
$serviceRoleKey = ($envContent | Select-String "SUPABASE_SERVICE_ROLE_KEY=(.+)").Matches.Groups[1].Value

if (!$supabaseUrl -or !$serviceRoleKey) {
    Write-Host "Error: Could not find Supabase credentials in .env.local" -ForegroundColor Red
    exit 1
}

# Read the migration file
$migrationSql = Get-Content "supabase\migrations\20260114_create_seats_table.sql" -Raw

Write-Host "Supabase URL: $supabaseUrl" -ForegroundColor Cyan
Write-Host "Executing migration..." -ForegroundColor Cyan

# Execute SQL via Supabase REST API
$headers = @{
    "apikey" = $serviceRoleKey
    "Authorization" = "Bearer $serviceRoleKey"
    "Content-Type" = "application/json"
}

$body = @{
    query = $migrationSql
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/rpc/exec_sql" -Method POST -Headers $headers -Body $body -ErrorAction Stop
    Write-Host "✅ Migration completed successfully!" -ForegroundColor Green
    Write-Host "The seats table has been created." -ForegroundColor Green
} catch {
    Write-Host "❌ Migration failed. Running via direct SQL query endpoint..." -ForegroundColor Yellow
    
    # Alternative: Use PostgREST query endpoint
    try {
        # For Supabase, we need to use the SQL editor or direct postgres connection
        Write-Host ""
        Write-Host "Please run this SQL manually in Supabase SQL Editor:" -ForegroundColor Yellow
        Write-Host "1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new" -ForegroundColor Cyan
        Write-Host "2. Copy and paste the contents of:" -ForegroundColor Cyan
        Write-Host "   supabase\migrations\20260114_create_seats_table.sql" -ForegroundColor White
        Write-Host "3. Click 'Run'" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Or use Supabase CLI:" -ForegroundColor Yellow
        Write-Host "   supabase db push" -ForegroundColor White
    } catch {
        Write-Host "Error: $_" -ForegroundColor Red
    }
}
