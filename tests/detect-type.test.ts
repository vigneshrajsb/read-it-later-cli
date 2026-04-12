import { describe, expect, test } from "bun:test";
import { detectType } from "../src/items";

describe("detectType", () => {
  describe("video detection", () => {
    test("detects YouTube URLs", () => {
      expect(detectType("https://youtube.com/watch?v=abc123", false)).toBe(
        "video",
      );
      expect(detectType("https://www.youtube.com/watch?v=abc123", false)).toBe(
        "video",
      );
      expect(detectType("https://youtu.be/abc123", false)).toBe("video");
    });

    test("detects Vimeo URLs", () => {
      expect(detectType("https://vimeo.com/123456", false)).toBe("video");
    });

    test("detects TikTok URLs", () => {
      expect(detectType("https://tiktok.com/@user/video/123", false)).toBe(
        "video",
      );
      expect(detectType("https://www.tiktok.com/@user/video/123", false)).toBe(
        "video",
      );
    });

    test("detects Instagram reels", () => {
      expect(detectType("https://instagram.com/reel/abc123", false)).toBe(
        "video",
      );
      expect(detectType("https://instagram.com/p/abc123", false)).toBe("video");
    });

    test("detects Netflix URLs", () => {
      expect(detectType("https://netflix.com/watch/123", false)).toBe("video");
    });

    test("detects Twitch URLs", () => {
      expect(detectType("https://twitch.tv/channel", false)).toBe("video");
    });

    test("detects Loom URLs", () => {
      expect(detectType("https://loom.com/share/abc123", false)).toBe("video");
    });
  });

  describe("article detection", () => {
    test("detects Medium articles", () => {
      expect(detectType("https://medium.com/@user/article-title", false)).toBe(
        "article",
      );
    });

    test("detects blog posts", () => {
      expect(detectType("https://blog.example.com/post", false)).toBe(
        "article",
      );
    });

    test("detects news sites", () => {
      expect(detectType("https://nytimes.com/2024/article", false)).toBe(
        "article",
      );
      expect(detectType("https://techcrunch.com/2024/01/01/story", false)).toBe(
        "article",
      );
    });

    test("detects documentation", () => {
      expect(detectType("https://docs.example.com/guide", false)).toBe(
        "article",
      );
    });
  });

  describe("bookmark detection", () => {
    test("marks as bookmark when flag is true", () => {
      expect(detectType("https://youtube.com/watch?v=abc123", true)).toBe(
        "bookmark",
      );
      expect(detectType("https://medium.com/article", true)).toBe("bookmark");
      expect(detectType("https://example.com", true)).toBe("bookmark");
    });

    test("bookmark flag overrides video detection", () => {
      expect(detectType("https://youtube.com/watch?v=abc123", true)).toBe(
        "bookmark",
      );
    });
  });
});
