import { describe, it, expect } from "vitest";
import {
  buildMatchString,
  findQuotedSpan,
  extractEnclosedQuote,
  buildSourceWindow,
  MAX_LOOKBACK,
  MIN_MATCH_CHARS,
} from "./quotedMatch";

describe("buildMatchString", () => {
  it("strips markdown, dandas, and quote marks", () => {
    const { match } = buildMatchString("स च ‘**अविद्या मृत्युं तीत्वां**’ ।");
    expect(match).toBe("स च अविद्या मृत्युं तीत्वां");
  });

  it("treats anusvara and syllable-final म् as the same nasal (विज्ञानम् == विज्ञानं)", () => {
    expect(buildMatchString("विज्ञानम्").match).toBe("विज्ञानं");
    expect(buildMatchString("आनन्दम्").match).toBe("आनन्दं");
    expect(buildMatchString("विज्ञानम्").match).toBe(
      buildMatchString("विज्ञानं").match,
    );
  });

  it("collapses whitespace runs (pāda newlines) to single spaces", () => {
    const { match } = buildMatchString("अविद्यया मृत्युं तीर्त्वा\nविद्ययाऽमृतमश्नुते ।।");
    expect(match).toBe("अविद्यया मृत्युं तीर्त्वा विद्ययाऽमृतमश्नुते");
  });

  it("elides a space after a syllable-final virama (तत् त्वमसि == तत्त्वमसि)", () => {
    // The cited chhandogya edition reads the sandhi UNFUSED ("तत् त्वमसि");
    // the quote is fused ("तत्त्वमसि"). A space after a virama carries no
    // sound, so both must normalize identically.
    expect(buildMatchString("तत् त्वमसि").match).toBe(buildMatchString("तत्त्वमसि").match);
    expect(buildMatchString("तत्त्वमसि").match).toBe("तत्त्वमसि");
    // ordinary intra-word spaces are untouched
    expect(buildMatchString("स च ब्रह्म").match).toBe("स च ब्रह्म");
  });

  it("returns a map from each kept char to its original index", () => {
    const { match, map } = buildMatchString("a।b");
    expect(match).toBe("ab");
    expect(map).toEqual([0, 2]);
  });

  it("retains the original index of chars after a whitespace collapse", () => {
    const { match, map } = buildMatchString("ab\ncd");
    expect(match).toBe("ab cd");
    // The collapsed space IS a kept character, so it owns an index.
    expect(map).toEqual([0, 1, 2, 3, 4]);
  });

  it("normalizes to NFC", () => {
    // A precomposed vs decomposed sequence must align. 'मृत' precomposed:
    const { match } = buildMatchString("\u092e\u0943\u0924\u0902");
    expect(match.normalize("NFC")).toBe(match);
  });
});

describe("findQuotedSpan — negatives", () => {
  it("returns null for an unrelated window", () => {
    const window = "इत्यादि प्रसिद्धानन्याधीनैश्वर्यं विवृणोति योsसौ पुरुषः";
    const passage = "पूषन्नेकर्षे यम सूर्य प्राजापत्य व्यूह रश्मीन् समूह तेजः";
    expect(findQuotedSpan(window, passage)).toBeNull();
  });

  it("returns null when the passage is shorter than MIN_MATCH_CHARS", () => {
    const window = "एकम् ब्रह्म";
    const passage = "एकम्";
    expect(findQuotedSpan(window, passage)).toBeNull();
  });

  it("returns null for an empty window", () => {
    expect(findQuotedSpan("", "अविद्या मृत्युं तीर्त्वा विद्ययाऽमृतमश्नुते ।।")).toBeNull();
  });

  it("returns null when the window is empty after normalization", () => {
    expect(findQuotedSpan("।। ॥", "अविद्या मृत्युं तीर्त्वा विद्ययाऽमृतमश्नुते ।।")).toBeNull();
  });

  it("returns a well-formed span bounded by the passage length", () => {
    const window = "स च अविद्या मृत्युं तीत्वां विद्ययाऽमृतमश्नुते";
    const passage = "विद्यां चाविद्यां च यस्तद्वेदोभयँ सह ।\nअविद्यया मृत्युं तीर्त्वा विद्ययाऽमृतमश्नुते ।।";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      expect(span.start).toBeGreaterThanOrEqual(0);
      expect(span.start).toBeLessThan(span.end);
      expect(span.end).toBeLessThanOrEqual(passage.length);
    }
  });
});

describe("findQuotedSpan — exact and near-exact quotes", () => {
  it("matches an exact pāda quote (Gītā 8.13)", () => {
    const window = "वयं चागायत् **ओमित्येकाक्षरं ब्रह्म व्याहरन्मामनुस्मरन्** (";
    const passage =
      "ओमित्येकाक्षरं ब्रह्म व्याहरन्मामनुस्मरन् ।\nयः प्रयाति त्यजन् देहं स याति परमां गतिम्";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      expect(passage.slice(span.start, span.end)).toContain("ओमित्येकाक्षरं ब्रह्म व्याहरन्मामनुस्मरन्");
    }
  });

  it("matches a quote with a single-character typo (Īśa 11: तीत्वां vs तीर्त्वा)", () => {
    const window = "स च ‘अविद्या मृत्युं तीत्वां विद्ययाऽमृतमश्नुते’ (ई. उ. ११)";
    const passage =
      "विद्यां चाविद्यां च यस्तद्वेदोभयँ सह ।\nअविद्यया मृत्युं तीर्त्वा विद्ययाऽमृतमश्नुते ।।";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      const quoted = passage.slice(span.start, span.end);
      // The aligned run must cover the shared suffix विद्ययाऽमृतमश्नुते.
      expect(quoted).toContain("विद्ययाऽमृतमश्नुते");
    }
  });

  it("matches across a pāda-break newline + danda (Īśa 11 mula shape)", () => {
    const window = "स च अविद्या मृत्युं तीत्वां विद्ययाऽमृतमश्नुते";
    const passage =
      "विद्यां चाविद्यां च यस्तद्वेदोभयँ सह ।\nअविद्यया मृत्युं तीर्त्वा विद्ययाऽमृतमश्नुते ।।";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      expect(passage.slice(span.start, span.end)).toContain("विद्ययाऽमृतमश्नुते");
    }
  });

  it("matches a truncated quote with sandhi drift (Īśa 4: जवीयः vs जवीयो)", () => {
    const window = "अनेजदेकं मनसो जवीयः (";
    const passage =
      "अनेजदेकं मनसो जवीयो नैनद्देवा आप्नुवन् पूर्वमर्षत् ।\nतद्धावतोऽन्यानत्येति तिष्ठत्तस्मिन्नपो मातरिश्वा दधाति ॥";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      const quoted = passage.slice(span.start, span.end);
      expect(quoted).toContain("अनेजदेकं मनसो जवीयो");
    }
  });

  it("matches a spacing-drift quote (Īśa 1: ईशावास्यमिदं vs ईशा वास्यमिदं)", () => {
    const window = "ईशावास्यमिदं सर्वं यत्किञ्च जगत्यां जगत्";
    const passage =
      "ईशा वास्यमिदँ सर्वं यत्किंच जगत्यां जगत् ।\nतेन त्यक्तेन भुञ्जीथा मा गृधः कस्यस्विद्धनम् ॥";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      const quoted = passage.slice(span.start, span.end);
      expect(quoted).toContain("ईशा वास्यमिदँ सर्वं");
    }
  });
});

describe("findQuotedSpan — the window is prose around a short quote", () => {
  it("highlights only the quote region, not the surrounding prose", () => {
    const window = "ि क्षरं प्रधानममृताक्षरं हरः क्षरात्मानावीशते देव एकः";
    const passage =
      "क्षरं प्रधानममृताक्षरं हरः क्षरात्मानावीशते देव एकः ।\nतस्य वशी प्रभवः सर्वव्यापी स नित्यः";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      const quoted = passage.slice(span.start, span.end);
      expect(quoted).toContain("क्षरं प्रधानममृताक्षरं हरः");
    }
  });
});

describe("findQuotedSpan — grapheme boundaries (no dotted circle)", () => {
  it("pulls a trailing matra into the span instead of splitting श + ा (Śvet 1.9)", () => {
    const window = "ि क्तं चिदचिदात्मकम्, ईशा — ज्ञाज्ञौ द्वावजावीशनीशौ (";
    const passage =
      "ज्ञाज्ञौ द्वावजावीशनीशावजा ह्येका भोक्तृभोगार्थयुक्ता ।\nअनन्तश्चात्मा विश्वरूपो";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      const sliced = passage.slice(span.start, span.end);
      const after = passage.slice(span.end, span.end + 1);
      // The span must end on a full syllable — never on a bare base whose
      // matra is outside.
      expect(sliced).toContain("ज्ञाज्ञौ द्वावजावीशनीश");
      // The trailing ा matra's stroke paints past its cluster box, so the
      // next grapheme (व) is swallowed to avoid a visible gap — the highlight
      // now runs ...शनीशाव and the next glyph after it is ज.
      expect(sliced).toContain("शनीशाव");
      expect(after).toBe("ज");
    }
  });

  it("clamps a span that starts on a virama back to the conjunct base", () => {
    const window = "्लोके पुरुषो भवति तथेतः प्रेत्य भवति";
    const passage =
      "सर्वं खल्विदं ब्रह्म तज्जलानिति शान्त उपासीत ।\n" +
      "अथ खलु क्रतुमयः पुरुषो यथाक्रतुरस्मिँल्लोके पुरुषो भवति";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      const sliced = passage.slice(span.start, span.end);
      // Must not start with a virama (would render a dotted circle).
      expect(sliced.startsWith("्")).toBe(false);
      expect(sliced).toContain("पुरुषो भवति");
    }
  });

  it("trims leading/trailing space graphemes from the highlight", () => {
    const window = "स च अविद्या मृत्युं तीत्वां विद्ययाऽमृतमश्नुते";
    const passage =
      "विद्यां चाविद्यां च यस्तद्वेदोभयँ सह ।\nअविद्यया मृत्युं तीर्त्वा विद्ययाऽमृतमश्नुते ।।";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      expect(passage[span.start]).not.toMatch(/\s/);
      expect(passage[span.end - 1]).not.toMatch(/\s/);
    }
  });
});

describe("findQuotedSpan — whole-passage quotes now highlight (suppression removed)", () => {
  it("still highlights a partial quote under the coverage threshold", () => {
    const window = "अग्निहोत्रादि तु तत्कार्यायैव";
    const passage = "अग्निहोत्रादि तु तत्कार्यायैव तद्दर्शनात्";
    expect(findQuotedSpan(window, passage)).not.toBeNull();
  });

  it("highlights a match that covers the entire passage", () => {
    const window = "अग्निहोत्रादि तु तत्कार्यायैव";
    const passage = "अग्निहोत्रादि तु तत्कार्यायैव ।";
    // A whole-passage quote is a meaningful highlight (decision: highlight
    // anyway), not noise to suppress.
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      expect(passage.slice(span.start, span.end)).toContain("अग्निहोत्रादि");
    }
  });

  it("highlights a whole-sutra quote even with inline verse-number chrome (brahma-sutra 1.4.8)", () => {
    // Brahma-sutra stores the verse number inline: "चमसवदविशेषात् ॥ १-४-८ ॥".
    // The quote covers 100% of the sutra content — it still highlights (the
    // number suffix is chrome but does not suppress).
    const window = "एवमेव व्यासार्यै:, ‘चमसवदविशेषात्’ (";
    const passage = "चमसवदविशेषात् ॥ १-४-८ ॥";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      expect(passage.slice(span.start, span.end)).toContain("चमसवदविशेषात्");
    }
  });

  it("still highlights a partial sutra quote when verse-number chrome is present", () => {
    const window = "अग्निहोत्रादि तु तत्कार्यायैव";
    const passage = "अग्निहोत्रादि तु तत्कार्यायैव तद्दर्शनात् ॥ ४-१-१६ ॥";
    expect(findQuotedSpan(window, passage)).not.toBeNull();
  });
});

describe("findQuotedSpan — sandhi-unfused source quote (chhandogya 6.8.7)", () => {
  it("matches तत्त्वमसि against the split तत् त्वमसि in the cited passage", () => {
    // The cited chhandogya base edition reads the sandhi unfused.
    const window = "तत्त्वमसि (";
    const passage =
      "ऐतदात्म्यमिदँ सर्वम् । तत्सत्यम् । स आत्मा । तत् त्वमसि श्वेतकेतो " +
      "इति । भूयएव मा भगवान्विज्ञापयत्विति । तथा सोम्येति होवाच ॥ ७ ॥";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      expect(passage.slice(span.start, span.end)).toBe("तत् त्वमसि");
    }
  });
});

describe("findQuotedSpan — word-initial a-vowel sandhi fusion (chhandogya 8.7.1)", () => {
  it("matches अपहतपाप्मा against the fused आत्मापहतपाप्मा in the cited passage", () => {
    // In the cited chhandogya the word is "आत्मापहतपाप्मा" = आत्मा + अपहतपाप्मा
    // (the quote's leading अ fuses into the preceding आ). The matcher must
    // align the sandhi-absorbed tail (पहतपाप्मा).
    const window = "अपहतपाप्मा (";
    const passage =
      "य आत्मापहतपाप्मा विजरो विमृत्युर्विशोको विजिघत्सोऽपिपासः " +
      "सत्यकामः सत्यसङ्कल्पः सोऽन्वेष्टव्यः स विजिज्ञासितव्यः स " +
      "सर्वाꣳश्च लोकानाप्नोति सर्वाꣳश्च कामान्यस्तमात्मानमनुविद्य " +
      "विजानातीति ह प्रजापतिरुवाच ॥ १ ॥";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      expect(passage.slice(span.start, span.end)).toBe("पहतपाप्मा");
    }
  });
});

describe("buildSourceWindow — does not cross an earlier cross-reference", () => {
  it("stops the lookback just after a prior (ref) on the same line", () => {
    // Para 123 has two कौ. उ. ३.६४ refs on one line (no newline, so the
    // window would otherwise sweep the whole paragraph). The second ref's
    // window must not include the first crossref.
    const text =
      "ननु च सर्वस्य जन्तोः परमात्मान्तर्यामी तन्नियाम्यं च सर्वमेवेत्युक्तम् । " +
      "एष एव साधु कर्म कारयति ते यमेभ्यो लोकेभ्य उन्निनीषति (कौ. उ. ३.६४) । " +
      "एष एवासाधु कर्म कारयति तं यमधो निनीषतीति (कौ. उ. ३.६४) ।";
    const refStart = text.lastIndexOf("कौ. उ. ३.६४") + 2; // second ref's text start
    const window = buildSourceWindow(text, refStart);
    expect(window.text.includes("कौ. उ. ३.६४) । एष")).toBe(false);
    expect(window.text).toContain("एष एवासाधु कर्म कारयति तं यमधो निनीषतीति");
  });

  it("keeps a whole single-line quote window when no earlier crossref exists", () => {
    const text = "तदेवम् । तेषां सततयुक्तानां भजतां प्रीतिपूर्वकम् । (भ. गी. १०.१०)";
    const refStart = text.indexOf("भ. गी. १०.१०");
    const window = buildSourceWindow(text, refStart);
    expect(window.text).toContain("तेषां सततयुक्तानां भजतां प्रीतिपूर्वकम्");
  });
});

describe("findQuotedSpan — no punctuation at the highlight edges", () => {
  it("trims a leading danda leaked in by a matched space (chhandogya 8.13.1)", () => {
    const window = "धूत्वा शरीरमकृतं कृतात्मा ब्रह्मलोकमभिसंभवामि (";
    const passage =
      "श्यामाच्छबलं प्रपद्ये शबलाच्छ्यामं प्रपद्ये । अश्व इव रोमाणि विधूय " +
      "पापंचन्द्र इव राहोर्मुखात् प्रमुच्य । धूत्वा शरीरमकृतं कृतात्मा " +
      "ब्रह्मलोकमभिसंभवामीति";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      const sliced = passage.slice(span.start, span.end);
      expect(sliced.startsWith("।")).toBe(false);
      expect(sliced).toContain("धूत्वा शरीरमकृतं कृतात्मा");
    }
  });

  it("trims a leading danda in the taittiriya 2.6.3 shape", () => {
    const window = "सत्यशब्दोऽत्र जीवपरः, सत्यं चानृतं च सत्यमभवत्, (";
    const passage =
      "सञ्च त्यञ्चाभवत् । निरुक्तं चानिरुक्तं च । निलयनं च अनिलयनं च " +
      "विज्ञानञ्च अविज्ञानं च । सत्यं चानृतं च सत्यमभवत् । यदिदं किञ्च । " +
      "तत्सत्यमित्याचक्षते । तदप्येष श्लोको भवति ॥";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    if (span) {
      const sliced = passage.slice(span.start, span.end);
      expect(sliced.startsWith("।")).toBe(false);
      expect(sliced).toContain("सत्यं चानृतं च सत्यमभवत्");
    }
  });
});

describe("extractEnclosedQuote", () => {
  it("returns the last markdown-bold span near the window end", () => {
    const q = extractEnclosedQuote("वयं च **ओमित्येकाक्षरं ब्रह्म व्याहरन्मामनुस्मरन्** (");
    expect(q?.text).toBe("**ओमित्येकाक्षरं ब्रह्म व्याहरन्मामनुस्मरन्**");
    expect(q?.start).toBe(6);
    expect(q?.end).toBe(6 + "**ओमित्येकाक्षरं ब्रह्म व्याहरन्मामनुस्मरन्**".length);
  });

  it("returns the last of several quoted spans in one window", () => {
    expect(
      extractEnclosedQuote("‘**एको ह वै**’ (मु. उ. १.१) ‘**अनपहतपाप्मा**’ (शत. ब्रा.)")?.text,
    ).toBe("‘**अनपहतपाप्मा**’");
  });

  it("returns the outer pair when bold is nested inside curly quotes", () => {
    expect(extractEnclosedQuote("स च ‘अविद्या मृत्युं तीर्त्वा’ (ई. उ. ११)")?.text).toBe(
      "‘अविद्या मृत्युं तीर्त्वा’",
    );
  });

  it("returns null when no complete quote pair is visible", () => {
    expect(extractEnclosedQuote("इत्यादि प्रसिद्धानन्याधीनैश्वर्यं विवृणोति")).toBeNull();
  });

  it("returns null when the quote sits far from the window end", () => {
    expect(extractEnclosedQuote("**प्राचीनम्** अत्र किञ्चिदपि न विद्यते इत्यादि")).toBeNull();
  });
});

describe("buildSourceWindow", () => {
  it("takes the MAX_LOOKBACK chars before the ref and extends to whitespace", () => {
    const text = "अब" + "सी".repeat(40) + " शब्द";
    const refStart = text.length;
    const window = buildSourceWindow(text, refStart);
    // Extends backward past the 60-char cut to the whitespace before the
    // final word, so the window starts on a word boundary.
    expect(window.text.endsWith(" शब्द")).toBe(true);
    expect(window.text.length).toBeGreaterThan(MAX_LOOKBACK);
    expect(window.start).toBe(text.length - window.text.length);
  });

  it("does not extend past the citation start", () => {
    const text = "abc def ghi";
    // ref at index 4: raw cut would be [max(0,4-60)=0, 4)="abc "; no earlier
    // whitespace to walk to, so it clamps at the text start.
    const window = buildSourceWindow(text, 4);
    expect(window.text).toBe("abc ");
    expect(window.start).toBe(0);
  });

  it("extends backward past the hard cut to the citation's enclosing quote", () => {
    // A quoted verse longer than MAX_LOOKBACK: the 60-char cut lands inside
    // the quote, so the window must walk back to its opener.
    const quoted = "**" + "अविद्या मृत्युं तीर्त्वा विद्ययाऽमृतमश्नुते पूषन्नेकर्षे यम सूर्य प्राजापत्य व्यूह रश्मीन् समूह तेजः ।" + "**";
    expect(quoted.length).toBeGreaterThan(MAX_LOOKBACK);
    const text = "इति ह स्माह " + quoted + " (ई. उ. ११) इत्यादि";
    const refStart = text.indexOf("ई. उ. ११");
    const window = buildSourceWindow(text, refStart);
    expect(window.text).toContain(quoted);
    expect(window.start).toBeLessThanOrEqual(text.indexOf(quoted));
    // The extracted quote is the fully-formed span, now that both delimiters
    // are in the window.
    expect(extractEnclosedQuote(window.text)?.text).toBe(quoted);
  });

  it("does not extend when no complete quote pair precedes the cut", () => {
    const text = "अत्र किञ्चिदपि न विद्यते इत्यादि प्रोक्तम् (अष्टा. २.२.६५)";
    const refStart = text.indexOf("अष्टा");
    const window = buildSourceWindow(text, refStart);
    expect(window.start).toBe(0);
    expect(window.text).toBe(text.slice(0, refStart));
  });
});

describe("constants sanity", () => {
  it("MAX_LOOKBACK is 60 and MIN_MATCH_CHARS is 10", () => {
    expect(MAX_LOOKBACK).toBe(60);
    expect(MIN_MATCH_CHARS).toBe(10);
  });
});

describe("findQuotedSpan — tight quote needle (prose window, danda-delimited quote)", () => {
  it("matches the phrase after the last danda, not the surrounding prose", () => {
    // The window is prose + a danda + the quote (para 14, chhandogya 6.3.2).
    const window = "त्वदन्तर्यामिणमेवाचष्ट इति ।\nअनेन जीवेनात्मनानुप्रविश्य नामरूपे व्याकरवाणि (";
    const passage = "स एवं विद्वान् अनेन जीवेनात्मनानुप्रविश्य नामरूपे व्याकरवाणि ।";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    // The match hugs the quote (अनेन जीवेन…व्याकरवाणि), never the prose before the danda.
    const matched = passage.slice(span!.start, span!.end);
    expect(matched).toContain("नामरूपे व्याकरवाणि");
    expect(matched).not.toContain("त्वदन्तर्यामि");
  });

  it("matches the whole multi-pāda shloka, not a prose fragment", () => {
    // The window holds the full quoted shloka (both pādas, pāda-broken by a
    // danda+newline). The highlight must span the WHOLE verse (including the
    // first pāda), not just its last pāda, and not swallow unrelated prose.
    const window = "कृत्यानां प्रपञ्चनम् ।\nवेदशब्देभ्य एवादौ दैवादीनां चकार सः ॥\n(";
    const passage = "कृत्यानां च प्रपंचनम् ।\nवेदशब्देभ्य एवादौ देवादीनां चकार सः";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    const matched = passage.slice(span!.start, span!.end);
    expect(matched).toContain("प्रपंचनम्");
    expect(matched).toContain("वेदशब्देभ्य");
    expect(matched).toContain("चकार सः");
  });

  it("matches a long single-sentence quote (para 9, chhandogya 6.1.4)", () => {
    const window = "विज्ञातं स्याद्वाचारम्भणं विकारो नामधेयं मृत्तिकेत्येव सत्यम् (";
    const passage = "यथा सोम्यैकेन मृत्पिण्डेन सर्वं मृन्मयं विज्ञातँ स्यात् । वाचारम्भणं विकारोनामधेयं मृत्तिकेत्येव सत्यम्";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    const matched = passage.slice(span!.start, span!.end);
    expect(matched).toContain("सत्यम्");
  });

  it("matches a short precise phrase ('अयमात्मा ब्रह्म') against prose", () => {
    // The quote is only 9 chars — below the old MIN_MATCH_CHARS prose floor —
    // but precise, so it must still match.
    const window = "…तत्त्वमसि (छा.उ.६.८.४) ।\nअयमात्मा ब्रह्म ।\n(";
    const passage = "वैष्णवमनुस्मृत्य अयमात्मा ब्रह्म सर्वमेतत् ।";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    expect(passage.slice(span!.start, span!.end)).toContain("अयमात्मा ब्रह्म");
  });

  it("matches a single word whose only drift is anusvara vs final म् (विज्ञानम्/विज्ञानं)", () => {
    // Para 7: the window quotes "विज्ञानम्" (final म्) and "आनन्दम्"; the
    // Taittiriya passages store "विज्ञानं"/"आनन्दं" (anusvara). The anusvara
    // normalization makes these exact matches.
    const window = "…(श्वे.उ.६.१), विज्ञानम् (";
    const passage = "विज्ञानं ब्रह्मेति व्यजानात् । विज्ञानाद्ध्येव खल्विमानि भूतानि";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    expect(passage.slice(span!.start, span!.end)).toContain("विज्ञानं");

    const window2 = "…(तै.उ.भृ.५.१) आनन्दम् (";
    const passage2 = "यतो वाचो निवर्तन्ते । अप्राप्य मनसा सह । आनन्दं ब्रह्मणो विद्वान्";
    const span2 = findQuotedSpan(window2, passage2);
    expect(span2).not.toBeNull();
    expect(passage2.slice(span2!.start, span2!.end)).toContain("आनन्दं");
  });
});

describe("findQuotedSpan — whole-verse highlight (para 17, Vishnu Purāṇa 1.5.63)", () => {
  it("highlights the full two-pāda shloka from the real source window", () => {
    // Para 17's source window: prose lead, then the quoted shloka (both pādas,
    // pāda-broken by danda+newline). The window extension must sweep the full
    // verse; the match must cover both pādas (not just the second), and the
    // leading prose ("संस्थाः…यावत् ।\nआह च भगवान् पराशरः\n") must not be
    // swallowed.
    const window =
      "संस्थाः संस्थानानि रूपाणीति यावत् ।\nआह च भगवान् पराशरः\n" +
      "नाम रूपं भूतानां कृत्यानां प्रपञ्चनम् ।\n" +
      "वेदशब्देभ्य एवादौ दैवादीनां चकार सः ॥\n(";
    const passage =
      "नाम रूपं च भूतानां कृत्यानां च प्रपंचनम् ।\n" +
      "वेदशब्देभ्य एवादौ देवादीनां चकार सः";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    const matched = passage.slice(span!.start, span!.end);
    expect(matched).toContain("नाम रूपं");
    expect(matched).toContain("चकार सः");
    // The matched passage span starts at the verse's beginning.
    expect(span!.start).toBe(0);
    // The source highlight excludes the leading prose.
    expect(window.slice(span!.sourceStart, span!.sourceEnd)).not.toContain(
      "यावत्",
    );
  });
});

describe("findQuotedSpan — comma-elision union (para 236)", () => {
  it("unions comma-separated segments that each match their own passage region", () => {
    // The quote joins two canonical phrases with a comma, compressing the
    // passage's intervening words ("तत्सत्यम् । स आत्मा ।"). The joined
    // needle fails whole-passage similarity, so the matcher unions the
    // per-segment matches into one highlight spanning both phrases.
    const window = ", ऐतदात्म्यमिदं सर्वं, तत्त्वमसि श्वेतकेतो (";
    const passage =
      "ऐतदात्म्यमिदँ सर्वम् । तत्सत्यम् । स आत्मा । तत् त्वमसि श्वेतकेतो " +
      "इति । भूयएव मा भगवान् विज्ञापयत्विति । तथा सोम्येति होवाच";
    const span = findQuotedSpan(window, passage);
    expect(span).not.toBeNull();
    const matched = passage.slice(span!.start, span!.end);
    expect(matched).toContain("ऐतदात्म्यमिदँ सर्वम्");
    expect(matched).toContain("तत् त्वमसि श्वेतकेतो");
    // The union spans BOTH phrases (with the compressed middle), not just the
    // second half.
    expect(matched).toContain("स आत्मा");
  });
});
