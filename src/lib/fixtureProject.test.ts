import { describe, expect, it } from "vitest";
import { loadFixtureProject } from "./fixtureProject";

describe("loadFixtureProject", () => {
  it("loads the bundled firmware fixture files", async () => {
    const project = await loadFixtureProject(async (path) => {
      const fixtures: Record<string, string> = {
        "fixtures/KobitoKey.keymap": `/ {
          keymap {
            compatible = "zmk,keymap";
            default_layer {
              bindings = <
                &kp Q &kp W &kp E &kp R &kp T &kp Y &kp U &kp I &kp O &kp P
                &kp A &kp S &kp D &kp F &kp G &kp H &kp J &kp K &kp L &kp SEMI
                &kp Z &kp X &kp C &kp V &kp B &kp N &kp M &kp COMMA &kp DOT &kp APOS
                &kp LSHFT &kp LALT &kp LCMD &lt 2 SPACE &kp LCTRL &kp BSPC &lt 1 ENTER &kp RSHFT &kp RSHFT &mt LALT SLASH
              >;
            };
          };
        };`,
        "fixtures/KobitoKey_left.overlay": `
          &spi0 {
            tb_left: trackball@0 {
              cpi = <200>;
            };
          };
        `,
        "fixtures/KobitoKey_right.overlay": `
          &spi0 {
            tb_right: trackball@0 {
              cpi = <600>;
            };
          };
        `,
      };
      return new Response(fixtures[String(path)], { status: 200 });
    });

    expect(project.keymap).toContain("default_layer");
    expect(project.leftOverlay).toContain("tb_left");
    expect(project.rightOverlay).toContain("tb_right");
  });

  it("rejects missing fixture assets instead of parsing the response body", async () => {
    await expect(
      loadFixtureProject(async () => new Response("<!doctype html>not found", { status: 404, statusText: "Not Found" })),
    ).rejects.toThrow("fixtures/KobitoKey.keymap を取得できません: 404 Not Found");
  });

  it("rejects fixture responses that return HTML fallback content", async () => {
    await expect(
      loadFixtureProject(async () => new Response("<!doctype html><title>fallback</title>", { status: 200 })),
    ).rejects.toThrow("fixtures/KobitoKey.keymap が HTML fallback を返しました");
  });

  it("rejects fixture responses that do not contain a parseable keymap", async () => {
    await expect(loadFixtureProject(async () => new Response("not a keymap", { status: 200 }))).rejects.toThrow(
      "fixture keymap に layer が見つかりません",
    );
  });

  it("rejects fixture overlays without trackball CPI settings", async () => {
    await expect(
      loadFixtureProject(async (path) => {
        const fixtures: Record<string, string> = {
          "fixtures/KobitoKey.keymap": `/ {
            keymap {
              compatible = "zmk,keymap";
              default_layer {
                bindings = <
                  &kp Q &kp W &kp E &kp R &kp T &kp Y &kp U &kp I &kp O &kp P
                  &kp A &kp S &kp D &kp F &kp G &kp H &kp J &kp K &kp L &kp SEMI
                  &kp Z &kp X &kp C &kp V &kp B &kp N &kp M &kp COMMA &kp DOT &kp APOS
                  &kp LSHFT &kp LALT &kp LCMD &lt 2 SPACE &kp LCTRL &kp BSPC &lt 1 ENTER &kp RSHFT &kp RSHFT &mt LALT SLASH
                >;
              };
            };
          };`,
          "fixtures/KobitoKey_left.overlay": "&spi0 { tb_left: trackball@0 { }; };",
          "fixtures/KobitoKey_right.overlay": "&spi0 { tb_right: trackball@0 { }; };",
        };
        return new Response(fixtures[String(path)], { status: 200 });
      }),
    ).rejects.toThrow("fixture overlay に trackball CPI が見つかりません");
  });
});
