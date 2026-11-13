using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using RPL2Kenangan.Components;
using RPL2Kenangan.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "rpl2-admin";
        options.LoginPath = "/admin/login";
        options.AccessDeniedPath = "/admin/login";
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
    });
builder.Services.AddAuthorization();
builder.Services.AddCascadingAuthenticationState();

builder.Services.AddSingleton<PhotoCatalog>();
builder.Services.AddSingleton<CommentStore>();
builder.Services.AddSingleton<BulletinStore>();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseAntiforgery();
app.UseAuthentication();
app.UseAuthorization();

app.MapPost("/admin/sign-in", async (HttpContext http, IConfiguration config) =>
{
    var form = await http.Request.ReadFormAsync();
    var password = form["password"].ToString();
    var expected = config["Admin:Password"] ?? "";
    if (string.IsNullOrEmpty(expected) || !CryptographicOperations.FixedTimeEquals(
        System.Text.Encoding.UTF8.GetBytes(password ?? ""),
        System.Text.Encoding.UTF8.GetBytes(expected)))
    {
        return Results.Redirect("/admin/login?error=1");
    }

    var identity = new System.Security.Claims.ClaimsIdentity(
        new[] { new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Name, "Admin") },
        CookieAuthenticationDefaults.AuthenticationScheme);
    await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new System.Security.Claims.ClaimsPrincipal(identity));
    return Results.Redirect("/galeri?mode=admin");
}).DisableAntiforgery();

app.MapGet("/admin/logout", async (HttpContext http) =>
{
    await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.Redirect("/");
});

app.MapPost("/admin/delete-photo", (HttpContext http, PhotoCatalog catalog, CommentStore comments, string category, string fileName) =>
{
    if (!(http.User.Identity?.IsAuthenticated ?? false)) return Results.Unauthorized();
    var photo = catalog.Photos.FirstOrDefault(p => p.Category == category && p.FileName == fileName);
    if (photo is null) return Results.NotFound();
    var deleted = catalog.Delete(photo);
    if (deleted) comments.Remove(photo.Key);
    return deleted ? Results.Ok() : Results.NotFound();
}).RequireAuthorization().DisableAntiforgery();

app.MapPost("/admin/delete-bulletin-note", (HttpContext http, BulletinStore store, string name, string text, DateTime at, int color) =>
{
    if (!(http.User.Identity?.IsAuthenticated ?? false)) return Results.Unauthorized();
    return store.RemoveNote(new BulletinNote(name, text, at, color)) ? Results.Ok() : Results.NotFound();
}).RequireAuthorization().DisableAntiforgery();

app.MapPost("/admin/delete-bulletin-sticker", (HttpContext http, BulletinStore store, string text, DateTime at) =>
{
    if (!(http.User.Identity?.IsAuthenticated ?? false)) return Results.Unauthorized();
    return store.RemoveSticker(new BulletinSticker(text, at)) ? Results.Ok() : Results.NotFound();
}).RequireAuthorization().DisableAntiforgery();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();
