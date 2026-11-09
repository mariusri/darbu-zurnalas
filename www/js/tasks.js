// Užduotys ir kalendorius.
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc;
  let mine = DZ.lsGet("tasks_mine") === "1";

  const isMineTask = t => (t.assignees || []).some(DZ.isMe);
  const visible = () => S.tasks.filter(t => !mine || isMineTask(t));

  function taskHtml(t, showDate) {
    const oname = t.object_id ? DZ.objName(t.object_id) : "";
    const late = t.status !== "atlikta" && t.date < DZ.today();
    return `<article class="task st-${esc(t.status)}${late ? " late" : ""}${t._pending ? " pending" : ""}">
      <div class="task-head">
        <span class="t-time">${showDate ? esc(DZ.shortDate(t.date)) + " " : ""}${esc(t.time || "")}</span>
        <h3>${esc(t.title || "Užduotis")}</h3>
      </div>
      ${oname ? `<button class="linkbtn" data-act="obj-open" data-id="${esc(t.object_id)}">📍 ${esc(oname)}</button>` : ""}
      ${t.description ? `<p class="work">${esc(t.description)}</p>` : ""}
      ${(t.assignees || []).length ? `<div class="chips">${t.assignees.map(n => `<span class="chip${DZ.isMe(n) ? " me" : ""}">${esc(n)}</span>`).join("")}</div>` : ""}
      <div class="seg" role="group" aria-label="Būsena">${Object.entries(DZ.TASK_STATUS).map(([k, v]) => `<button data-act="task-status" data-id="${esc(t.id)}" data-v="${k}" aria-pressed="${t.status === k}">${v}</button>`).join("")}</div>
      <div class="entry-actions">
        ${DZ.isLead() ? `<button class="btn danger" data-act="task-del" data-id="${esc(t.id)}">Ištrinti</button><button class="btn" data-act="task-edit" data-id="${esc(t.id)}">Redaguoti</button>` : ""}
        <button class="btn primary" data-act="task-entry" data-id="${esc(t.id)}">Sukurti įrašą</button>
      </div>
    </article>`;
  }

  DZ.views.tasks = {
    fab: () => DZ.isLead() ? { label: "+ Užduotis", act: "task-new" } : null,
    html() {
      const list = visible();
      const marks = new Set(list.filter(t => t.status !== "atlikta").map(t => t.date));
      const day = list.filter(t => t.date === S.taskDate).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
      const late = list.filter(t => t.status !== "atlikta" && t.date < DZ.today()).sort((a, b) => a.date.localeCompare(b.date));
      const upcoming = list.filter(t => t.status !== "atlikta" && t.date > S.taskDate).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "")).slice(0, 8);
      return `<section class="stack16">
        <div class="view-head"><h2>Užduotys</h2>
          <div class="seg small" role="group"><button data-act="task-mine" data-v="0" aria-pressed="${!mine}">Visos</button><button data-act="task-mine" data-v="1" aria-pressed="${mine}">Mano</button></div>
        </div>
        ${mine && !DZ.myName() ? `<p class="note">Jūsų vardas profilyje nenurodytas, todėl „Mano“ negali rasti užduočių.</p>` : ""}
        ${late.length ? `<details class="card warn" ${late.length < 4 ? "open" : ""}><summary><b>Vėluoja: ${late.length}</b></summary><div class="stack">${late.map(t => taskHtml(t, true)).join("")}</div></details>` : ""}
        ${DZ.weekStrip(S.taskDate, marks, "task")}
        <div class="day-title"><h2>${S.taskDate === DZ.today() ? "Šiandien, " : ""}${esc(DZ.longDate(S.taskDate))}</h2><span class="meta">${day.length ? day.length + " užd." : ""}</span></div>
        <div class="stack">${day.length ? day.map(t => taskHtml(t)).join("") : `<div class="empty"><span>Šiai dienai užduočių nėra.</span>${DZ.isLead() ? `<button class="btn primary" data-act="task-new">+ Užduotis</button>` : ""}</div>`}</div>
        ${upcoming.length ? `<h3 class="sec">Artimiausios</h3><div class="card">${upcoming.map(t => `<button class="date-sep sm" data-act="task-date" data-v="${t.date}">${esc(DZ.shortDate(t.date))} ${esc(t.time || "")} · ${esc(t.title)}${t.object_id ? " · " + esc(DZ.objName(t.object_id)) : ""} <span>›</span></button>`).join("")}</div>` : ""}
      </section>`;
    }
  };
  DZ.actions["task-date"] = t => { S.taskDate = t.dataset.v; DZ.render(); };
  DZ.actions["task-mine"] = t => { mine = t.dataset.v === "1"; DZ.lsSet("tasks_mine", mine ? "1" : "0"); DZ.render(); };
  DZ.actions["task-status"] = async t => {
    const task = S.tasks.find(x => x.id === t.dataset.id); if (!task || task.status === t.dataset.v) return;
    DZ.enqueue("update", "tasks", task.id, { status: t.dataset.v });
    DZ.render();
    await DZ.flush();
    DZ.render();
  };
  DZ.actions["task-entry"] = t => {
    const task = S.tasks.find(x => x.id === t.dataset.id); if (!task) return;
    DZ.openEditor(null, { date: task.date <= DZ.today() ? task.date : DZ.today(), object: task.object_id ? DZ.objName(task.object_id) : "", workers: task.assignees || [], work: task.title + (task.description ? "\n" + task.description : ""), taskId: task.id });
  };

  function openTaskEditor(task) {
    const d = task || { date: S.taskDate, time: "08:00", object_id: null, title: "", description: "", assignees: [] };
    const objs = S.objects.filter(o => o.status !== "baigta" || o.id === d.object_id).map(o => o.name).sort(DZ.byName);
    const names = [...new Set([...S.crew, ...(d.assignees || [])])];
    DZ.openSheet(`
      <h2>${task ? "Redaguoti užduotį" : "Nauja užduotis"}</h2>
      <div class="row2"><label class="field"><span class="lbl">Data</span><input type="date" id="t-date" value="${esc(d.date)}"></label>
        <label class="field"><span class="lbl">Laikas</span><input type="time" id="t-time" value="${esc(d.time)}"></label></div>
      <label class="field"><span class="lbl">Užduotis *</span><input id="t-title" value="${esc(d.title)}" placeholder="pvz. Sumontuoti bėgius ir modulius" autocomplete="off"></label>
      <label class="field"><span class="lbl">Objektas</span><input id="t-obj" list="t-obj-list" value="${esc(d.object_id ? DZ.objName(d.object_id) : "")}" autocomplete="off" placeholder="Pasirinkite arba įrašykite naują"></label>
      <datalist id="t-obj-list">${objs.map(o => `<option value="${esc(o)}"></option>`).join("")}</datalist>
      <div class="field"><span class="lbl">Kas dirbs</span>
        <div class="check-grid">${names.map((n, i) => `<label class="w-who"><input type="checkbox" class="t-as" id="t-as-${i}" value="${esc(n)}" ${(d.assignees || []).includes(n) ? "checked" : ""}><span>${esc(n)}</span></label>`).join("") || `<span class="note">Darbuotojų sąrašas tuščias.</span>`}</div>
      </div>
      <label class="field"><span class="lbl">Aprašymas</span><textarea id="t-desc" placeholder="Ką reikia padaryti, ką pasiimti">${esc(d.description)}</textarea></label>
      <p class="err" id="t-err" hidden></p>
      <div class="sheet-actions"><button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Išsaugoti</button></div>`, { form: true, id: "task-form" });
    $("#task-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const err = $("#t-err");
      const title = $("#t-title").value.trim();
      if (!title) { err.hidden = false; err.textContent = "Įrašykite, ką reikia padaryti."; return; }
      const btn = $("#task-form button[type=submit]"); btn.disabled = true;
      let objId = null; const oname = $("#t-obj").value.trim();
      if (oname) {
        const o = DZ.findObject(oname);
        if (o) objId = o.id;
        else {
          const r = await DZ.sb.from("objects").insert({ name: oname }).select().single();
          if (r.error) { btn.disabled = false; err.hidden = false; err.textContent = "Nepavyko sukurti objekto: " + r.error.message; return; }
          S.objects.push(r.data); objId = r.data.id;
        }
      }
      const row = { date: $("#t-date").value || DZ.today(), time: $("#t-time").value, title, description: $("#t-desc").value.trim(), object_id: objId, assignees: DZ.$$(".t-as").filter(x => x.checked).map(x => x.value) };
      const res = task ? await DZ.sb.from("tasks").update(row).eq("id", task.id).select().single() : await DZ.sb.from("tasks").insert(row).select().single();
      if (res.error) { btn.disabled = false; err.hidden = false; err.textContent = (DZ.isNetErr(res.error) ? "Nėra ryšio. " : "Nepavyko: ") + res.error.message; return; }
      const i = S.tasks.findIndex(x => x.id === res.data.id);
      if (i >= 0) S.tasks[i] = res.data; else S.tasks.push(res.data);
      S.taskDate = row.date;
      DZ.closeSheet(true); DZ.toast("Išsaugota"); DZ.render();
    });
    setTimeout(() => { if (!task) $("#t-title").focus(); }, 50);
  }
  DZ.actions["task-new"] = () => openTaskEditor(null);
  DZ.actions["task-edit"] = t => openTaskEditor(S.tasks.find(x => x.id === t.dataset.id));
  DZ.actions["task-del"] = t => {
    const task = S.tasks.find(x => x.id === t.dataset.id); if (!task) return;
    DZ.confirm("Ištrinti užduotį?", `„${task.title}“, ${DZ.shortDate(task.date)}.`, "Ištrinti", async () => {
      const { error } = await DZ.sb.from("tasks").delete().eq("id", task.id);
      if (error) { DZ.toast("Nepavyko: " + error.message, true); return; }
      S.tasks = S.tasks.filter(x => x.id !== task.id); DZ.toast("Ištrinta"); DZ.render();
    });
  };
})();
