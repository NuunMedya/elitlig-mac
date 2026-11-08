// Yayın Stüdyosu · Ayarlar › İŞLETİM sayfaları: LED ekran (içerik / görüntü / kayan yazı /
// ayna / geri sayım varsayılanları), Röportaj, Özet, Reji / Maç, Makrolar. Değerler
// studio.settings.v1 › ops'ta (./opsDefaults); düğmeler ve paneller buradan okur.
import React from "react";
import { Field } from "../../../components/ui";
import { INTERVIEW_STYLES } from "../../../lib/studio/graphics";
import { INTERVIEW_TITLES } from "../../../lib/studio/manageBroadcast";
import { LED_CONTENTS, TICKER_SPEEDS } from "../led/ledFx";
import { MacroEditor } from "../shortcuts/wGenel";
import { CARD_LENGTHS, HALF_PRESETS, STAT_COUNTERS } from "./opsDefaults";

const Seg = ({ value, choices, onChange }) => (
  <div className="st-seg">{choices.map(([k, l]) => <button key={String(k)} type="button" className={value === k ? "is-on" : ""} onClick={() => onChange(k)}>{l}</button>)}</div>
);
const Range = ({ label, value, min, max, step = 1, unit = "", onChange }) => (
  <Field label={`${label} · ${value}${unit}`}><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></Field>
);

/** Bölüm gövdesi: section anahtarına göre. */
export function opsSection(section, { Section, Toggle, settings, set, led, railCtx, audio }) {
  const o = settings.ops;
  const put = (sub) => (patch) => set("ops", { [sub]: { ...o[sub], ...patch } });
  if (section === "led") {
    const L = put("led");
    const fx = led?.fx;
    return (
      <>
        <Section title="LED içeriği ve görüntü" sub="LED düğmeleri ve LED penceresi bu ayarları kullanır. “Şimdi uygula”: açık LED'e hemen gönderir.">
          <Field label="Yeni içerik varsayılanı">
            <div className="st-chips">{LED_CONTENTS.map((c) => <button key={c.key} type="button" className={`st-chip ${o.led.content === c.key ? "is-on" : ""}`} onClick={() => L({ content: c.key })} title={c.hint}>{c.label}</button>)}</div>
          </Field>
          <Range label="Parlaklık" value={o.led.brightness} min={10} max={100} step={5} unit=" %" onChange={(v) => L({ brightness: v })} />
          {fx && (
            <div className="st-row st-row--wrap">
              <button type="button" className="btn btn--sm" onClick={() => led.setFx({ content: o.led.content, brightness: o.led.brightness })}>Şimdi uygula (içerik + parlaklık)</button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => led.setFx({ brightness: 100, scale: 100, offX: 0, offY: 0, freeze: false, black: false })}>LED görüntüsünü sıfırla</button>
              <span className="st-hint">Şu an: {LED_CONTENTS.find((c) => c.key === fx.content)?.label} · %{fx.brightness} · ölçek %{fx.scale}{fx.freeze ? " · DONDU" : ""}{fx.black ? " · SİYAH" : ""}</span>
            </div>
          )}
        </Section>
        <Section title="Kayan yazı" sub="LED alt bandındaki kayan yazının varsayılan metni ve hızı.">
          <Field label="Metin"><input value={o.led.tickerText} maxLength={300} onChange={(e) => L({ tickerText: e.target.value })} /></Field>
          <Field label="Hız"><Seg value={o.led.tickerSpeed} onChange={(v) => { L({ tickerSpeed: v }); led?.setFx({ ticker: { speed: v } }); }} choices={TICKER_SPEEDS.map((s, i) => [s, ["Çok yavaş", "Yavaş", "Orta", "Hızlı", "Çok hızlı"][i]])} /></Field>
          {led && <button type="button" className="btn btn--sm" onClick={() => led.setFx({ ticker: { text: o.led.tickerText, speed: o.led.tickerSpeed, on: true } })}>LED'de başlat</button>}
        </Section>
        <Section title="Program aynası (tekrar LED'de)" sub="Ayna, programın küçültülmüş karelerini LED'e gönderir: tekrar, VAR, özet ve özel kipler LED'de de görünür.">
          <Range label="Ayna kare hızı" value={o.led.mirrorFps} min={2} max={15} unit=" kare/sn" onChange={(v) => { L({ mirrorFps: v }); led?.setFx({ mirrorFps: v }); }} />
          <Toggle checked={o.led.mirrorOnReplay} onChange={(v) => L({ mirrorOnReplay: v })} title="Tekrar / VAR yayındayken LED otomatik aynaya geçsin" text="Bitince önceki içeriğe döner (LED açıkken)" />
        </Section>
        <Section title="Sponsor ve geri sayım">
          <Range label="Sponsor döngüsü (her logo)" value={o.led.sponsorSec} min={3} max={60} unit=" sn" onChange={(v) => { L({ sponsorSec: v }); led?.setFx({ sponsorSec: v }); }} />
          <Range label="Geri sayım varsayılanı" value={o.led.countdownMin} min={1} max={60} unit=" dk" onChange={(v) => L({ countdownMin: v })} />
          <Field label="Geri sayım başlığı"><input value={o.led.countdownLabel} maxLength={60} onChange={(e) => { L({ countdownLabel: e.target.value }); led?.setFx({ countdownLabel: e.target.value }); }} /></Field>
        </Section>
      </>
    );
  }
  if (section === "roportaj") {
    const I = put("iv");
    return (
      <>
        <Section title="Röportaj bandı" sub="Konuk ve başlık düğmelerinin varsayılanları.">
          <Field label="Varsayılan başlık"><div className="st-chips">{INTERVIEW_TITLES.map((t) => <button key={t} type="button" className={`st-chip ${o.iv.title === t ? "is-on" : ""}`} onClick={() => I({ title: t })}>{t}</button>)}</div></Field>
          <Field label="Varsayılan şablon"><Seg value={o.iv.style} onChange={(v) => I({ style: v })} choices={INTERVIEW_STYLES.map((s) => [s.key, s.label])} /></Field>
          <Range label="Son konuk listesi" value={o.iv.recentLimit} min={2} max={20} unit=" kişi" onChange={(v) => I({ recentLimit: v })} />
        </Section>
        <Section title="Kayıt" sub="Röportaj kaydı düğmesi: bant, hedef süre, an işareti.">
          <Toggle checked={o.iv.bandWithRecord} onChange={(v) => I({ bandWithRecord: v })} title="Kayıt başlarken bant da açılsın" />
          <Range label="Hedef süre" value={o.iv.targetMin} min={1} max={30} unit=" dk" onChange={(v) => I({ targetMin: v })} />
          <Range label="“An işaretle” geriye" value={o.iv.markSeconds} min={5} max={30} unit=" sn" onChange={(v) => I({ markSeconds: v })} />
          <Toggle checked={o.iv.confirmDelete} onChange={(v) => I({ confirmDelete: v })} title="Kaydı silmeden önce sor" />
        </Section>
        <Section title="Röportaj mikrofonu" sub="Röportaj mikrofonu düğmesi hangi kanalı açsın.">
          <Field label="Kanal">
            <div className="st-chips">{(audio?.strips || []).map((s) => <button key={s.id} type="button" className={`st-chip ${o.iv.micStrip === s.id ? "is-on" : ""}`} onClick={() => I({ micStrip: s.id })}>{s.label}</button>)}{!audio?.strips && <span className="st-hint">Karıştırıcı hazır değil.</span>}</div>
          </Field>
          <Toggle checked={o.iv.muteOthers} onChange={(v) => I({ muteOthers: v })} title="Röportaj mikrofonu açılınca öbür mikrofonlar kapansın" text="Yorumcu mikrofonu röportaj sırasında yayına gitmez" />
        </Section>
      </>
    );
  }
  if (section === "ozet") {
    const Hh = put("hl");
    return (
      <>
        <Section title="Kartlar" sub="Özetin giriş ve kapanış kartı (Özet panelinde ve düğmesinde değiştirilebilir).">
          <Field label="Giriş kartı"><Seg value={o.hl.intro} onChange={(v) => Hh({ intro: v })} choices={CARD_LENGTHS.map((c) => [c.key, `${c.label}${c.introMs ? ` · ${c.introMs / 1000} sn` : ""}`])} /></Field>
          <Field label="Kapanış kartı"><Seg value={o.hl.outro} onChange={(v) => Hh({ outro: v })} choices={CARD_LENGTHS.map((c) => [c.key, `${c.label}${c.outroMs ? ` · ${(c.outroMs / 1000).toString().replace(".", ",")} sn` : ""}`])} /></Field>
          <Toggle checked={o.hl.includeMoments} onChange={(v) => Hh({ includeMoments: v })} title="Özete “özete ekle” işaretli önemli anlar da girsin" />
        </Section>
        <Section title="Müzik" sub="Yeni seçilen arka plan müziğinin seviyesi.">
          <Range label="Kartlarda" value={o.hl.musicDb} min={-40} max={0} unit=" dB" onChange={(v) => Hh({ musicDb: v })} />
          <Range label="Kliplerde kıs" value={o.hl.duckDb} min={-40} max={0} unit=" dB" onChange={(v) => Hh({ duckDb: v })} />
        </Section>
        <Section title="Davranış">
          <Toggle checked={o.hl.confirmUpload} onChange={(v) => Hh({ confirmUpload: v })} title="Yüklemeden önce sor" text="Sunucuda özet varsa her zaman sorulur" />
          <Toggle checked={o.hl.previewWhenDone} onChange={(v) => Hh({ previewWhenDone: v })} title="Özet oluşunca önizlemeye al" />
        </Section>
      </>
    );
  }
  if (section === "mac") {
    const M = put("mac");
    return (
      <>
        <Section title="Süreler" sub="Devre süresi düğmesinin varsayılanı (maç başına düğmeden değişir).">
          <Field label="Devre süresi"><Seg value={o.mac.halfMin} onChange={(v) => M({ halfMin: v })} choices={HALF_PRESETS.map((m) => [m, `2×${m}`])} /></Field>
          <Field label="Devre sayısı"><Seg value={o.mac.periods} onChange={(v) => M({ periods: v })} choices={[[1, "1"], [2, "2"], [3, "3"], [4, "4"]]} /></Field>
          <Range label="Uzatma üst sınırı" value={o.mac.injuryMax} min={3} max={20} unit=" dk" onChange={(v) => M({ injuryMax: v })} />
        </Section>
        <Section title="Davranış">
          <Toggle checked={o.mac.confirmFinish} onChange={(v) => M({ confirmFinish: v })} title="Maçı bitirmeden önce sor" />
          <Field label="Hızlı puan adımı"><Seg value={o.mac.ratingStep} onChange={(v) => M({ ratingStep: v })} choices={[[0.5, "Yarım"], [1, "Tam"]]} /></Field>
          <Toggle checked={o.mac.possessionToSubtitle} onChange={(v) => M({ possessionToSubtitle: v })} title="Topla oynamayı altyazıya verme düğmesi" />
          <Field label="Skorbord kısa ad uzunluğu"><Seg value={o.mac.codeLen} onChange={(v) => M({ codeLen: v })} choices={[[2, "2"], [3, "3"], [4, "4"], [5, "5"]]} /></Field>
        </Section>
        <Section title="İstatistik sayaçları" sub="Sayaç düğmesinde görünenler (yerel, maç başına).">
          <div className="st-chips">{STAT_COUNTERS.map((s) => {
            const on = o.mac.statKeys.includes(s.key);
            return <button key={s.key} type="button" className={`st-chip ${on ? "is-on" : ""}`} onClick={() => M({ statKeys: on ? o.mac.statKeys.filter((k) => k !== s.key) : [...o.mac.statKeys, s.key] })}>{on ? "✓ " : ""}{s.label}</button>;
          })}</div>
        </Section>
      </>
    );
  }
  if (section === "makro") {
    const Mc = put("macro");
    return (
      <>
        <Section title="Makrolar" sub="Bir makro, eylemleri sırayla yapar (ör. “Devre arası” = Devre arası ekranı + altyazı + müzik). Makro düğmesi ya da makro bankasıyla çalıştır.">
          <MacroEditor ctx={railCtx} />
        </Section>
        <Section title="Çalıştırma">
          <Range label="Adımlar arası bekleme" value={o.macro.stepDelayMs} min={0} max={2000} step={50} unit=" ms" onChange={(v) => Mc({ stepDelayMs: v })} />
          <Toggle checked={o.macro.confirmRun} onChange={(v) => Mc({ confirmRun: v })} title="Çalıştırmadan önce adımları göster ve sor" />
        </Section>
      </>
    );
  }
  return null;
}
