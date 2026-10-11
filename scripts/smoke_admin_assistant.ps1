param([string]$BaseUrl = 'http://localhost:5173')
$ErrorActionPreference = 'Stop'
if (([uri]$BaseUrl).Host -notin @('localhost', '127.0.0.1')) { throw 'Smoke only supports localhost.' }
$apiUrl = "$BaseUrl/api/orders-service"
function Send-Post($session, $path, $body, $csrf = $true) {
    $headers = @{}
    if ($csrf) {
        $token = Invoke-RestMethod "$apiUrl/auth/csrf" -WebSession $session
        $headers['X-CSRF-TOKEN'] = $token.token
    }
    Invoke-WebRequest "$apiUrl/$path" -Method Post -WebSession $session -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress) -SkipHttpErrorCheck -TimeoutSec 240
}
$adminSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$login = Send-Post $adminSession 'auth/login' @{ email = 'admin@autowise.test'; password = 'DemoAdmin!2026' }
if ($login.StatusCode -ne 200) { throw "Admin login: $($login.StatusCode)" }
$body = @{ question = 'Tóm tắt số lượng đơn hàng, khách hàng và phiếu hỗ trợ hiện tại.'; scope = 'overview' }
$noCsrf = Send-Post $adminSession 'admin/assistant/messages' $body $false
if ($noCsrf.StatusCode -ne 400) { throw "Missing CSRF: $($noCsrf.StatusCode)" }
$guest = Send-Post ([Microsoft.PowerShell.Commands.WebRequestSession]::new()) 'admin/assistant/messages' $body
if ($guest.StatusCode -ne 401) { throw "Guest access: $($guest.StatusCode)" }
$customerSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$customerLogin = Send-Post $customerSession 'auth/login' @{ email = 'customer1@autowise.test'; password = 'DemoCustomer!2026' }
if ($customerLogin.StatusCode -ne 200) { throw "Customer login: $($customerLogin.StatusCode)" }
$customer = Send-Post $customerSession 'admin/assistant/messages' $body
if ($customer.StatusCode -ne 403) { throw "Customer access: $($customer.StatusCode)" }
$invalid = Send-Post $adminSession 'admin/assistant/messages' @{ question = 'test'; scope = 'sql' }
if ($invalid.StatusCode -ne 422) { throw "Unknown tool: $($invalid.StatusCode)" }
foreach ($scope in @('overview', 'orders', 'customers', 'support', 'revenue', 'period-statistics')) {
    $inputBody = switch ($scope) {
        'overview' { $body }
        'orders' { @{ question = 'Đơn AW-DEMO-0001 đang ở trạng thái nào và còn phải thu bao nhiêu VND?'; scope = 'orders'; query = 'AW-DEMO-0001' } }
        'customers' { @{ question = 'Khách hàng này có bao nhiêu đơn?'; scope = 'customers'; query = 'customer1@autowise.test' } }
        'support' { @{ question = 'Có phiếu hỗ trợ nào khớp bộ lọc không?'; scope = 'support'; query = 'ADMIN-AI-NONEXISTENT' } }
        'revenue' { @{ question = 'Doanh thu và tiền thu ròng tháng này là bao nhiêu?'; scope = 'overview' } }
        'period-statistics' { @{ question = 'Thống kê tháng trước: số đơn mới và khách hàng mới trong kỳ?'; scope = 'overview' } }
    }
    $result = Send-Post $adminSession 'admin/assistant/messages' $inputBody
    if ($result.StatusCode -ne 200) { throw "$scope status $($result.StatusCode): $($result.Content)" }
    $reply = $result.Content | ConvertFrom-Json
    if (!$reply.grounded -or !$reply.answer) { throw "$scope response is not grounded" }
    Write-Output "$scope : HTTP 200, grounded=true, $($reply.links.Count) links"
}
Write-Output 'PASS: guest 401; customer 403; CSRF 400; unknown tool 422; five tools plus automatic period statistics.'
