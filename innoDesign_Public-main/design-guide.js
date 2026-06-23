const tabs = Array.from(document.querySelectorAll("[data-tab-target]"));
const panels = Array.from(document.querySelectorAll(".workspace-panel"));
const markdownSource = document.getElementById("markdownSource");
const markdownOutput = document.getElementById("markdownOutput");
const customSelects = Array.from(document.querySelectorAll("[data-select]"));
const toastStack = document.getElementById("toastStack");
const modalOverlay = document.getElementById("modalOverlay");
const drawerPanel = document.getElementById("drawerPanel");

function getMarkdown() {
  return markdownSource?.textContent?.trim() ?? "";
}

function toPlainText(markdown) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^- /gm, "")
    .replace(/`/g, "")
    .trim();
}

function activateTab(targetId) {
  tabs.forEach((tab) => {
    const active = tab.dataset.tabTarget === targetId;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  panels.forEach((panel) => {
    const active = panel.id === targetId;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

function closeCustomSelect(select) {
  const trigger = select.querySelector(".custom-select-trigger");
  const menu = select.querySelector(".custom-select-menu");
  select.classList.remove("is-open");
  trigger?.setAttribute("aria-expanded", "false");
  if (menu) {
    menu.hidden = true;
  }
}

function openCustomSelect(select) {
  const trigger = select.querySelector(".custom-select-trigger");
  const menu = select.querySelector(".custom-select-menu");
  customSelects.forEach((item) => {
    if (item !== select) {
      closeCustomSelect(item);
    }
  });
  select.classList.add("is-open");
  trigger?.setAttribute("aria-expanded", "true");
  if (menu) {
    menu.hidden = false;
  }
}

function flashButton(button, nextLabel) {
  if (!button) {
    return;
  }

  const original = button.textContent;
  button.textContent = nextLabel;
  window.setTimeout(() => {
    button.textContent = original;
  }, 1400);
}

function pushToast(message) {
  if (!toastStack) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<strong>Preview</strong><span>${message}</span>`;
  toastStack.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 2600);
}

async function copyText(button, text) {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      flashButton(button, "Copied");
      return;
    } catch (error) {
      // Fall through to the legacy copy path for local file contexts.
    }
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "true");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.select();

  const copied = document.execCommand("copy");
  helper.remove();
  flashButton(button, copied ? "Copied" : "Copy failed");
}

function downloadMarkdownFile() {
  const blob = new Blob([getMarkdown()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "DESIGN_GUIDE_FOR_AI.md";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tabTarget));
});

customSelects.forEach((select) => {
  const trigger = select.querySelector(".custom-select-trigger");
  const options = Array.from(select.querySelectorAll(".custom-select-option"));

  closeCustomSelect(select);

  trigger?.addEventListener("click", () => {
    const isOpen = select.classList.contains("is-open");
    if (isOpen) {
      closeCustomSelect(select);
      return;
    }
    openCustomSelect(select);
  });

  options.forEach((option) => {
    option.addEventListener("click", () => {
      options.forEach((item) => item.classList.remove("is-selected"));
      option.classList.add("is-selected");
      const label = trigger?.querySelector("span");
      if (label) {
        label.textContent = option.textContent ?? "";
      }
      closeCustomSelect(select);
    });
  });
});

document.querySelectorAll("[data-open-tab]").forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.openTab));
});

document.querySelectorAll("[data-toast]").forEach((button) => {
  button.addEventListener("click", () => {
    pushToast(button.getAttribute("data-toast") ?? "완료되었습니다.");
  });
});

document.getElementById("copyMarkdown")?.addEventListener("click", (event) => {
  copyText(event.currentTarget, getMarkdown());
});

document.getElementById("copyPlainText")?.addEventListener("click", (event) => {
  copyText(event.currentTarget, toPlainText(getMarkdown()));
});

document.getElementById("downloadMarkdown")?.addEventListener("click", (event) => {
  downloadMarkdownFile();
  flashButton(event.currentTarget, "Downloaded");
});

function closeModal() {
  if (modalOverlay) {
    modalOverlay.hidden = true;
  }
}

function openModal() {
  if (modalOverlay) {
    modalOverlay.hidden = false;
  }
}

function closeDrawer() {
  if (drawerPanel) {
    drawerPanel.classList.remove("is-open");
    drawerPanel.setAttribute("aria-hidden", "true");
  }
}

function openDrawer() {
  if (drawerPanel) {
    drawerPanel.classList.add("is-open");
    drawerPanel.setAttribute("aria-hidden", "false");
  }
}

document.getElementById("openModal")?.addEventListener("click", openModal);
document.getElementById("closeModal")?.addEventListener("click", closeModal);
document.getElementById("closeModalSecondary")?.addEventListener("click", closeModal);

modalOverlay?.addEventListener("click", (event) => {
  if (event.target === modalOverlay) {
    closeModal();
  }
});

document.getElementById("openDrawer")?.addEventListener("click", openDrawer);
document.getElementById("closeDrawer")?.addEventListener("click", closeDrawer);
document.getElementById("closeDrawerSecondary")?.addEventListener("click", closeDrawer);

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }
  customSelects.forEach((select) => {
    if (!select.contains(target)) {
      closeCustomSelect(select);
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    customSelects.forEach(closeCustomSelect);
    closeModal();
    closeDrawer();
  }
});

if (markdownOutput) {
  markdownOutput.value = getMarkdown();
}
