// desktop/src/Character.tsx
type Props = {
  sleeping: boolean;
  angry: boolean;
  onFaceClick: () => void;
  onFaceContextMenu: () => void;
};

function Character({ sleeping, angry, onFaceClick, onFaceContextMenu }: Props) {
  return (
      <div className={`fredo-character ${sleeping ? "sleeping" : ""} ${angry ? "angry" : ""}`}>

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
          onClick={onFaceClick}
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

          <div className="forehead-star">★</div>

          <div className="eyes">
            <div className="eye"><span /></div>
            <div className="eye"><span /></div>
          </div>

          {angry && (
            <>
              <div className="brow brow-left" />
              <div className="brow brow-right" />
            </>
          )}

          <div className="cheek cheek-left" />
          <div className="cheek cheek-right" />

          <div className="mouth" />

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
    </div>
  );
}

export default Character;