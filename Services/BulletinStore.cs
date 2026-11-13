using System.Text.Json;

namespace RPL2Kenangan.Services;

public record BulletinNote(string Name, string Text, DateTime At, int Color);
public record BulletinSticker(string Text, DateTime At);

public class BulletinStore
{
    private readonly string _path;
    private readonly object _lock = new();
    private BulletinData _data = new();

    public BulletinStore(IWebHostEnvironment env)
    {
        var dir = Path.Combine(env.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "bulletin.json");
        Load();
    }

    public IReadOnlyList<BulletinNote> Notes
    {
        get { lock (_lock) return _data.Notes.OrderByDescending(x => x.At).ToList(); }
    }

    public IReadOnlyList<BulletinSticker> Stickers
    {
        get { lock (_lock) return _data.Stickers.OrderByDescending(x => x.At).ToList(); }
    }

    public void AddNote(string name, string text, int color)
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        lock (_lock)
        {
            _data.Notes.Add(new BulletinNote(
                string.IsNullOrWhiteSpace(name) ? "Anonim" : name.Trim(),
                text.Trim(), DateTime.Now, color));
            Save();
        }
    }

    public void AddSticker(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        lock (_lock)
        {
            _data.Stickers.Add(new BulletinSticker(text.Trim(), DateTime.Now));
            Save();
        }
    }

    public bool RemoveNote(BulletinNote note)
    {
        lock (_lock)
        {
            var removed = _data.Notes.Remove(note);
            if (removed) Save();
            return removed;
        }
    }

    public bool RemoveSticker(BulletinSticker sticker)
    {
        lock (_lock)
        {
            var removed = _data.Stickers.Remove(sticker);
            if (removed) Save();
            return removed;
        }
    }

    private void Load()
    {
        if (!File.Exists(_path)) return;
        try { _data = JsonSerializer.Deserialize<BulletinData>(File.ReadAllText(_path)) ?? new(); }
        catch { _data = new(); }
    }

    private void Save() => File.WriteAllText(_path, JsonSerializer.Serialize(_data, new JsonSerializerOptions { WriteIndented = true }));

    private sealed class BulletinData
    {
        public List<BulletinNote> Notes { get; set; } = new();
        public List<BulletinSticker> Stickers { get; set; } = new();
    }
}
