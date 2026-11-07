import { test, expect, type APIRequestContext } from "@playwright/test";
test("account forms cannot submit before JavaScript is ready", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const path of ["/signup/student", "/signup/teacher", "/login"]) {
      await page.goto(path);
      await expect(page.locator("form")).toHaveAttribute("method", "post");
      await expect(page.locator("form button")).toBeDisabled();
    }
  } finally {
    await context.close();
  }
});
async function register(
  api: APIRequestContext,
  role = "student",
  code = "LOOP10",
) {
  const email = `${role}-${crypto.randomUUID()}@example.test`;
  const res = await api.post("/api/auth/signup", {
    data: {
      name: role === "teacher" ? "Test Teacher" : "Test Student",
      email,
      password: "local-test-pass-123",
      role,
      code,
    },
  });
  expect(res.status()).toBe(200);
  return email;
}
async function draft(
  api: APIRequestContext,
  mode: "need" | "offer",
  text: string,
) {
  const d = await (
    await api.post("/api/intake", { data: { mode, text } })
  ).json();
  expect(d.items.length).toBeGreaterThan(0);
  const res = await api.post("/api/intake/confirm", {
    data: { id: d.id, items: d.items },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).ids[0];
}
test("landing, student signup, confirmation and persistent profile", async ({
  page,
}) => {
  const email = `avery-${crypto.randomUUID()}@example.test`;
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /A little help/ }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("landing-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Find your learning circle" }).click();
  await page.getByLabel("Your name").fill("Avery Test");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByLabel("Classroom invitation").fill("LOOP10");
  await page.getByRole("button", { name: "Join my classroom" }).click();
  await expect(page.getByRole("heading", { name: /Hey Avery/ })).toBeVisible();
  await page.getByRole("button", { name: "Talk to FavourLoop" }).click();
  await page.getByRole("button", { name: "Prefer to type?" }).click();
  await page
    .getByLabel("Your words")
    .fill("I need help with quadratic equations.");
  await page.getByRole("button", { name: "Help me put it into words" }).click();
  await expect(
    page.getByRole("heading", { name: "Did I get that right?" }),
  ).toBeVisible();
  let state = await (await page.request.get("/api/state")).json();
  expect(
    state.needs.filter(
      (n: { studentId: string }) => n.studentId === state.user.id,
    ),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm and find help" }).click();
  await expect(page.getByRole("dialog")).toContainText("Maya Chen");
  await page.screenshot({
    path: test.info().outputPath("match-review.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("heading", { name: "Quadratic equations", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Quadratic equations", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("student-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Find a helper" }).click();
  await expect(page.getByRole("dialog")).toContainText("Maya Chen");
  await page.request.post("/api/auth/logout", { data: {} });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Hey Avery/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Quadratic equations", exact: true }),
  ).toBeVisible();
});
test("role and classroom access are enforced by server", async ({
  browser,
}) => {
  const teacher = await browser.newContext(),
    student = await browser.newContext(),
    outsider = await browser.newContext();
  try {
    await register(teacher.request, "teacher", "TEACH10");
    await register(student.request);
    await register(outsider.request, "student", "LOOP11");
    expect(
      (
        await teacher.request.post("/api/availability", {
          data: { available: false },
        })
      ).status(),
    ).toBe(403);
    const invalid = await teacher.request.post("/api/auth/signup", {
      data: {
        name: "Pretend Teacher",
        email: `bad-${crypto.randomUUID()}@example.test`,
        password: "test-password-123",
        role: "teacher",
        code: "LOOP10",
      },
    });
    expect(invalid.status()).toBe(403);
    expect(
      (
        await student.request.post("/api/availability", {
          headers: { Origin: "https://another-site.example" },
          data: { available: false },
        })
      ).status(),
    ).toBe(403);
    const state = await (await outsider.request.get("/api/state")).json();
    expect(state.needs).toHaveLength(0);
    expect(state.offers).toHaveLength(0);
    expect(
      (await outsider.request.get("/api/matches/need-alex")).status(),
    ).toBe(404);
    const t = await teacher.newPage();
    await t.goto("/dashboard");
    await expect(
      t.getByRole("heading", { name: "Your classroom, connected." }),
    ).toBeVisible();
    await expect(
      t.getByRole("button", { name: "Talk to FavourLoop" }),
    ).toHaveCount(0);
    await t.screenshot({
      path: test.info().outputPath("teacher-desktop.png"),
      fullPage: true,
    });
  } finally {
    await teacher.close();
    await student.close();
    await outsider.close();
  }
});
test("mutual acceptance, real WebRTC connection, notes and teacher observation", async ({
  browser,
}) => {
  const a = await browser.newContext({ permissions: ["microphone"] }),
    b = await browser.newContext({ permissions: ["microphone"] }),
    t = await browser.newContext();
  try {
    await register(a.request);
    await register(b.request);
    await register(t.request, "teacher", "TEACH10");
    const needId = await draft(
      a.request,
      "need",
      "I need help with fractions.",
    );
    const offerId = await draft(
      b.request,
      "offer",
      "I can help with fractions.",
    );
    expect(
      (
        await a.request.post("/api/invite", { data: { needId, offerId } })
      ).status(),
    ).toBe(200);
    const pending = await (await b.request.get("/api/state")).json();
    const p = pending.proposals.find(
      (p: { needId: string }) => p.needId === needId,
    );
    const accepted = await b.request.post("/api/proposals/respond", {
      data: { id: p.id, accept: true },
    });
    expect(accepted.status()).toBe(200);
    const { sessionId } = await accepted.json();
    expect(
      (
        await b.request.post("/api/proposals/respond", {
          data: { id: p.id, accept: true },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await t.request.post(`/api/sessions/${sessionId}/join`, {
          data: { acknowledged: true },
        })
      ).status(),
    ).toBe(403);
    const pa = await a.newPage(),
      pb = await b.newPage(),
      pt = await t.newPage();
    await Promise.all([
      pa.goto(`/session/${sessionId}`),
      pb.goto(`/session/${sessionId}`),
      pt.goto(`/session/${sessionId}`),
    ]);
    for (const page of [pa, pb]) {
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Join voice call" }).click();
    }
    await expect(pa.getByText("You’re connected. Take your time.")).toBeVisible(
      { timeout: 30000 },
    );
    await expect(pb.getByText("You’re connected. Take your time.")).toBeVisible(
      { timeout: 30000 },
    );
    await pa
      .getByRole("button", { name: "Mute microphone", exact: true })
      .click();
    await expect(
      pa.getByRole("button", { name: "Unmute microphone", exact: true }),
    ).toBeVisible();
    await pa
      .getByLabel("Share a written note")
      .fill("We worked through one example together.");
    await pa.getByRole("button", { name: "Send note" }).click();
    await expect(
      pt.getByText("We worked through one example together."),
    ).toBeVisible();
    await expect(
      pt.getByRole("button", { name: "Join voice call" }),
    ).toHaveCount(0);
    await pa.screenshot({
      path: test.info().outputPath("live-call.png"),
      fullPage: true,
    });
    await pa.getByRole("button", { name: "Yes, that helped" }).click();
    await expect(
      pa.getByRole("heading", {
        name: "The requester reported that this helped.",
      }),
    ).toBeVisible();
    await expect(pb.getByText("This conversation has ended.")).toBeVisible();
    expect(
      (
        await b.request.post(`/api/sessions/${sessionId}/join`, {
          data: { acknowledged: true },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await a.request.post(`/api/sessions/${sessionId}/outcome`, {
          data: { outcome: "resolved" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await a.request.post(`/api/sessions/${sessionId}/outcome`, {
          data: { outcome: "still_need_help" },
        })
      ).status(),
    ).toBe(409);
    const finalState = await (await a.request.get("/api/state")).json();
    expect(
      finalState.needs.find((n: { id: string }) => n.id === needId).status,
    ).toBe("resolved");
  } finally {
    await a.close();
    await b.close();
    await t.close();
  }
});
test("responsive student dashboard and profile navigation", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    await context.request.post("/api/auth/demo", { data: { id: "alex" } });
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Hey Alex/ })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("student-mobile.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await page.getByRole("link", { name: "Learning profile" }).click();
    await expect(
      page.getByRole("heading", { name: "My learning profile." }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
