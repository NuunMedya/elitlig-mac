// Rehber: kişi avatarı. Fotoğraf adresi varsa fotoğraf, yoksa ya da
// yüklenemezse baş harfler + addan türeyen renk.
import React, { useState } from "react";
import { initialsOf, toneOf } from "../../lib/contactCore";

export function Avatar({ name, src, size = "" }) {
  const [broken, setBroken] = useState(false);
  const photo = src && !broken && /^https?:\/\//i.test(src);
  return (
    <span className={`rb-avatar ${size ? `rb-avatar--${size}` : ""}`} style={photo ? undefined : { "--tone": toneOf(name) }} aria-hidden="true">
      {photo ? <img src={src} alt="" onError={() => setBroken(true)} referrerPolicy="no-referrer" /> : initialsOf(name)}
    </span>
  );
}

export default Avatar;
