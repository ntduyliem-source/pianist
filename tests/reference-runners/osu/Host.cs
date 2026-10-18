// Headless host: containers, clock, key event and result storage only.
// Judgement decisions run in unchanged upstream files / GeneratedMethods.cs.
using osu.Game.Rulesets.Scoring;
using osu.Game.Rulesets.Objects;
using osu.Game.Rulesets.Judgements;
using osu.Game.Rulesets.Objects.Drawables;
namespace System { public static class TypeNames { public static string ReadableName(this Type type) => type.Name; } }
namespace osu.Game.Rulesets.Scoring {
    // Numeric order of the basic results in upstream HitResult.cs.
    public enum HitResult { None, Miss, Meh, Ok, Good, Great, Perfect, SmallTickHit, LargeTickHit, SliderTailHit, SmallBonus, LargeBonus }
    public static class HitResultExtensions {
        public static void ValidateHitResultPair(HitResult max, HitResult min) {
            if (min != HitResult.Miss || max != HitResult.Perfect) throw new InvalidOperationException("Unsupported result range");
        }
        public static bool IsValidHitResult(this HitResult r, HitResult min, HitResult max) => r >= min && r <= max;
    }
}
namespace osu.Game.Screens.Play { public interface IGameplayClock { bool IsRewinding {get;} double GetTrueGameplayRate(); } }
namespace osu.Framework.Input.Events { public record KeyBindingPressEvent<T>(T Action); }
namespace osu.Game.Rulesets.Mania { public enum ManiaAction { None = -1 } }
namespace osu.Game.Rulesets.Objects {
    public class HitObject {
        public string Id; public int Pitch; public double StartTime; public HitWindows HitWindows;
        public double GetEndTime() => StartTime;
    }
}
namespace osu.Game.Rulesets.Judgements {
    public class Judgement { public HitResult MinResult => HitResult.Miss; public HitResult MaxResult => HitResult.Perfect; }
    public class JudgementResult {
        public HitResult Type; public double RawTime; public double GameplayRate;
        public Judgement Judgement = new();
        public bool HasResult => Type != HitResult.None;
        public bool IsHit => Type > HitResult.Miss;
    }
}
namespace osu.Game.Rulesets.Objects.Drawables {
    public enum ArmedState { Hit, Miss }
    public class ManualClock { public double Current; public double Rate => 1; }
    public partial class DrawableHitObject {
        public HitObject HitObject;
        public ManualClock Time;
        public ManualClock Clock => Time;
        public JudgementResult Result = new();
        public bool Judged => Result.HasResult;
        public List<DrawableHitObject> NestedHitObjects = new();
        public Action<DrawableHitObject, JudgementResult> OnNewResult;
        protected virtual void CheckForResult(bool userTriggered, double timeOffset) { }
        protected void UpdateState(ArmedState state) { /* rendering only */ }
        protected void ApplyMinResult() => ApplyResult((r, _) => r.Type = r.Judgement.MinResult);
        protected void ApplyResult(HitResult type) => ApplyResult(static (result, state) => result.Type = state, type);
        protected void ApplyResult(Action<JudgementResult, DrawableHitObject> application) => ApplyResult(application, this);
        public void Advance() => UpdateResult(false);
    }
}
namespace osu.Game.Rulesets.Mania.Objects.Drawables {
    public class ActionBinding { public ManiaAction Value; }
    public class DrawableManiaHitObject : DrawableHitObject {
        public Func<DrawableHitObject, double, bool> CheckHittable;
        protected ActionBinding Action = new();
        public virtual void MissForcefully() => ApplyMinResult();
    }
    public partial class DrawableNote : DrawableManiaHitObject {
        public DrawableNote(HitObject hitObject, ManualClock time) {
            HitObject = hitObject; Time = time; Action.Value = (ManiaAction)hitObject.Pitch;
        }
    }
}
namespace osu.Game.Rulesets.UI {
    public class HitObjectContainer {
        public List<DrawableHitObject> Notes = new();
        public IEnumerable<DrawableHitObject> AliveObjects => Notes.OrderBy(n => n.HitObject.StartTime);
    }
}
namespace osu.Framework.Extensions.IEnumerableExtensions {
    public static class EnumerableExtensions {
        public static T GetNext<T>(this IEnumerable<T> items, T current) where T : class {
            bool seen = false;
            foreach (var item in items) { if (seen) return item; if (ReferenceEquals(item, current)) seen = true; }
            return null;
        }
    }
}
