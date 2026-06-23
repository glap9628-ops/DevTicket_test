using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Innotium.Sso;

/// <summary>
/// 이노티움 SSO 중앙 집중형 인증 클라이언트 (.NET 6+).
/// 사용자 로그인 검증 + 비밀번호 변경 + 사용자/부서 조회.
/// </summary>
public class SsoClient : IDisposable
{
    private readonly string _baseUrl;
    private readonly string _clientId;
    private readonly string _clientSecret;
    private readonly HttpClient _http;
    private readonly SemaphoreSlim _lock = new(1, 1);

    private string? _token;
    private DateTime _expiresAt = DateTime.MinValue;

    public SsoClient(string baseUrl, string clientId, string clientSecret, HttpClient? http = null)
    {
        _baseUrl = baseUrl.TrimEnd('/');
        _clientId = clientId; _clientSecret = clientSecret;
        _http = http ?? new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
    }

    private async Task<string> TokenAsync()
    {
        if (_token != null && DateTime.UtcNow < _expiresAt) return _token;
        await _lock.WaitAsync();
        try
        {
            if (_token != null && DateTime.UtcNow < _expiresAt) return _token;
            var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_clientId}:{_clientSecret}"));
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/apie/sso/oauth/client-token");
            req.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);
            using var res = await _http.SendAsync(req);
            var body = await ParseAsync(res);
            _token = body.GetProperty("access_token").GetString();
            var expiresIn = body.GetProperty("expires_in").GetInt32();
            _expiresAt = DateTime.UtcNow.AddSeconds(expiresIn - 60);
            return _token!;
        }
        finally { _lock.Release(); }
    }

    // ───── 로그인 검증 ─────
    public async Task<JsonElement> LoginAsync(string loginId, string password)
    {
        return await PostAsync("/apie/sso/auth/login", new { loginId, password });
    }

    // ───── 비밀번호 변경 ─────
    public async Task<JsonElement> ChangePasswordAsync(string loginId, string currentPassword, string newPassword)
    {
        return await PostAsync("/apie/sso/auth/password", new { loginId, currentPassword, newPassword });
    }

    // ───── 조회 ─────
    public async Task<JsonElement> GetUserAsync(long userId)
        => await GetAsync($"/apie/sso/users/{userId}");

    public async Task<JsonElement> ListUsersAsync(string? keyword = null, long? departmentId = null,
                                                    string? status = null, int startIndex = 0, int pageSize = 50)
    {
        var url = $"/apie/sso/users?startIndex={startIndex}&pageSize={pageSize}";
        if (keyword != null) url += "&keyword=" + Uri.EscapeDataString(keyword);
        if (departmentId != null) url += "&departmentId=" + departmentId;
        if (status != null) url += "&status=" + status;
        return await GetAsync(url);
    }

    public async Task<JsonElement> GetDepartmentAsync(long departmentId)
        => await GetAsync($"/apie/sso/departments/{departmentId}");

    public async Task<JsonElement> ListDepartmentsAsync(string? keyword = null, string? status = null,
                                                         int startIndex = 0, int pageSize = 500)
    {
        var url = $"/apie/sso/departments?startIndex={startIndex}&pageSize={pageSize}";
        if (keyword != null) url += "&keyword=" + Uri.EscapeDataString(keyword);
        if (status != null) url += "&status=" + status;
        return await GetAsync(url);
    }

    // ───── 내부 ─────
    private async Task<JsonElement> PostAsync(string path, object body)
    {
        var token = await TokenAsync();
        using var req = new HttpRequestMessage(HttpMethod.Post, _baseUrl + path) { Content = JsonContent.Create(body) };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var res = await _http.SendAsync(req);
        return await ParseAsync(res);
    }

    private async Task<JsonElement> GetAsync(string path)
    {
        var token = await TokenAsync();
        using var req = new HttpRequestMessage(HttpMethod.Get, _baseUrl + path);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var res = await _http.SendAsync(req);
        return await ParseAsync(res);
    }

    private static async Task<JsonElement> ParseAsync(HttpResponseMessage res)
    {
        var text = await res.Content.ReadAsStringAsync();
        var doc = string.IsNullOrWhiteSpace(text) ? JsonDocument.Parse("{}") : JsonDocument.Parse(text);
        if (!res.IsSuccessStatusCode)
        {
            var key = doc.RootElement.TryGetProperty("messageKey", out var mk) ? mk.GetString() : "UNKNOWN";
            throw new SsoApiException((int)res.StatusCode, key ?? "UNKNOWN", doc.RootElement.Clone());
        }
        return doc.RootElement.Clone();
    }

    public void Dispose() => _http.Dispose();
}

public class SsoApiException : Exception
{
    public int StatusCode { get; }
    public string MessageKey { get; }
    public JsonElement Body { get; }
    public SsoApiException(int sc, string mk, JsonElement body)
        : base($"SSO API {sc} {mk}")
    { StatusCode = sc; MessageKey = mk; Body = body; }
}

// 사용 예:
//   using var sso = new SsoClient("https://sso.innotium.com",
//       Environment.GetEnvironmentVariable("SSO_CLIENT_ID")!,
//       Environment.GetEnvironmentVariable("SSO_CLIENT_SECRET")!);
//   var user = await sso.LoginAsync("kim", "plain");
//   long userId = user.GetProperty("userId").GetInt64();
//   await sso.ChangePasswordAsync("kim", "old", "New1!");
