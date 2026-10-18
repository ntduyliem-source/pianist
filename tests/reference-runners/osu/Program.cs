using System.Text.Json;
using osu.Game.Rulesets.Mania;
using osu.Game.Rulesets.Mania.Scoring;
using osu.Game.Rulesets.Mania.UI;
using osu.Game.Rulesets.Mania.Objects.Drawables;
using osu.Game.Rulesets.Objects;
using osu.Game.Rulesets.Objects.Drawables;
using osu.Game.Rulesets.UI;
using osu.Framework.Input.Events;
using osu.Game.Rulesets.Scoring;

var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
var cases = JsonSerializer.Deserialize<List<Case>>(File.ReadAllText(args[0]), options);
var outputs = new List<object>();
var scoreProcessor=new ManiaScoreProcessor();
var weights=Enum.GetValues<HitResult>().Where(r=>r>=HitResult.Miss&&r<=HitResult.Perfect).ToDictionary(r=>r.ToString().ToLowerInvariant(),r=>scoreProcessor.GetBaseScoreForResult(r));
foreach (var scenario in cases) {
    var clock = new ManualClock();
    var windows = new ManiaHitWindows(); windows.SetDifficulty(scenario.Od);
    var lanes = new Dictionary<int, HitObjectContainer>();
    var policies = new Dictionary<int, OrderedHitPolicy>();
    var judgements = new List<object>();
    var extras = new List<int>();
    int? inputSeq = null;
    string inputTarget = null;
    foreach (var n in scenario.Notes.OrderBy(n => n.At)) {
        if (!lanes.ContainsKey(n.Pitch)) { lanes[n.Pitch] = new(); policies[n.Pitch] = new(lanes[n.Pitch]); }
        var note = new DrawableNote(new HitObject {Id=n.Id, StartTime=n.At, Pitch=n.Pitch, HitWindows=windows}, clock);
        var policy = policies[n.Pitch]; note.CheckHittable = policy.IsHittable;
        note.OnNewResult = (obj, result) => {
            judgements.Add(new { id=obj.HitObject.Id, grade=result.Type.ToString().ToLowerInvariant(), at=clock.Current,
                delta=clock.Current-obj.HitObject.StartTime, seq=inputTarget == obj.HitObject.Id ? inputSeq : null });
            if (result.IsHit) policy.HandleHit(obj);
        };
        lanes[n.Pitch].Notes.Add(note);
    }
    foreach (var step in scenario.Steps) {
        clock.Current = step.At;
        inputSeq = null; inputTarget = null;
        // Upstream's automatic CheckForResult before the next input. This host
        // uses caller-controlled deterministic clock steps, never a UI frame rate.
        foreach (var lane in lanes.Values) foreach (var note in lane.AliveObjects) note.Advance();
        if (step.Kind == "press") {
            inputSeq=step.Seq;
            bool consumed=false;
            if (lanes.TryGetValue(step.Pitch, out var lane))
                foreach (DrawableNote note in lane.AliveObjects) {
                    inputTarget = note.HitObject.Id;
                    if (note.OnPressed(new KeyBindingPressEvent<ManiaAction>((ManiaAction)step.Pitch))) {consumed=true;break;}
                }
            if (!consumed) extras.Add(step.Seq);
        }
    }
    outputs.Add(new {scenario.Id, weights, windows=Enum.GetValues<HitResult>().Where(r=>r>=HitResult.Miss&&r<=HitResult.Perfect).ToDictionary(r=>r.ToString().ToLowerInvariant(), r=>windows.WindowFor(r)), judgements, extras});
}
File.WriteAllText(args[1], JsonSerializer.Serialize(outputs, options));
var tails=new List<object>();
foreach(bool headHit in new[]{false,true})foreach(bool bodyBreak in new[]{false,true})foreach(double delta in new[]{-300,-260.25,-204.75,-168.75,-123.75,-74.25,-29.25,0,29.25,29.251,74.25,123.75,168.75,204.75,204.751,260.25,300}) {
    var clock=new ManualClock{Current=1000+delta};var windows=new ManiaHitWindows();windows.SetDifficulty(5);
    var tail=new TailProbe(new HitObject{Id="tail",Pitch=60,StartTime=1000,HitWindows=windows},clock);
    tail.HoldNote.Head.IsHit=headHit;tail.HoldNote.Body.HasHoldBreak=bodyBreak;tail.Advance();tail.Release();
    tails.Add(new{headHit,bodyBreak,delta,grade=tail.Result.Type.ToString().ToLowerInvariant()});
}
File.WriteAllText(Path.Combine(Path.GetDirectoryName(args[1]),"hold-tail-upstream.json"),JsonSerializer.Serialize(tails,options));
Console.WriteLine($"Executed unchanged upstream C# judgement methods: {cases.Count} cases.");
record Note(string Id, int Pitch, double At);
record Step(string Kind, double At, int Pitch=0, int Seq=0);
record Case(string Id, double Od, List<Note> Notes, List<Step> Steps);
