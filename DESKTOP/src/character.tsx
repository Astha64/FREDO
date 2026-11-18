// desktop/src/Character.tsx
import type { Action, Mood } from "./behavior";

const CONFETTI_COLORS = ["#ffc83d", "#f4a46d", "#bca6ed", "#7cc8ff", "#ff8fa3"];

type Props = {
  sleeping: boolean;
  mood: Mood;
  action: Action;
  talking: boolean;
  confetti: boolean;
  walking?: boolean;
  facing?: "left" | "right";
  onFaceClick: (shift: boolean) => void;
  onFaceContextMenu: () => void;
};

function Character({
  sleeping,
  mood,
  action,
  talking,
  confetti,
  walking = false,
  facing = "right",
  onFaceClick,
  onFaceContextMenu,
}: Props) {
  const classes = [
    "fredo-character",
    `mood-${mood}`,
    `act-${action}`,
    sleeping ? "sleeping" : "",
    walking ? "walking" : "",
    talking ? "talking" : "",
  ].join(" ");

  return (
    <div className={facing === "left" ? "fredo-flip flip" : "fredo-flip"}>
      <div className={classes}>

        <div className="aura" />

        {/* Wings */}
        <div className="wing wing-left" />
        <div className="wing wing-right" />

        {/* Body */}
        <div className="body">
          {/* Arms */}
          <div className="arm arm-left">
            <div className="hand" />
          </div>

          <div className="arm arm-right">
            <div className="hand" />
          </div>

          {/* Legs */}
          <div className="leg leg-left">
            <div className="foot" />
          </div>

          <div className="leg leg-right">
            <div className="foot" />
          </div>

          <div className="chest-star">★</div>
        </div>

        {/* Head */}
        <div className="head">
          <div className="hair">
            <div className="hair-curl" />
          </div>

          <div className="ear ear-left" />
          <div className="ear ear-right" />

          <div
            className="face"
            onClick={(event) => onFaceClick(event.shiftKey)}
            onContextMenu={(event) => {
              event.preventDefault();
              onFaceContextMenu();
            }}
            title="Click Fredo to sleep or wake up"
          >
            <div className="forehead-star">★</div>

            <div className="eyes">
              <div className="eye"><span /></div>
              <div className="eye"><span /></div>
            </div>

            <div className="brow brow-left" />
            <div className="brow brow-right" />

            <div className="cheek cheek-left" />
            <div className="cheek cheek-right" />

            <div className="mouth" />

            <div className="sweat-drop" />
            <div className="think-dots">
              <span />
              <span />
              <span />
            </div>

            {sleeping && (
              <div className="sleep-eyes">z Z</div>
            )}
          </div>
        </div>

        {/* Scarf */}
        <div className="scarf" />

        {/* Magical sparkles */}
        <span className="sparkle sparkle-one">✦</span>
        <span className="sparkle sparkle-two">✧</span>
        <span className="sparkle sparkle-three">✦</span>

        <div className="shadow" />

        {confetti && (
          <div className="confetti-layer">
            {Array.from({ length: 14 }, (_, i) => (
              <span
                key={i}
                className="confetti"
                style={{
                  left: `${4 + i * 7}%`,
                  background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  animationDelay: `${(i % 5) * 0.12}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Character;