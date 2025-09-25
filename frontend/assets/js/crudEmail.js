const BASE = "http://192.168.43.238:5000/api";

async function showAlert(msg, type = "success") {
  const box = document.getElementById("alertBox");
  box.innerHTML = `<div class="alert alert-${type} alert-dismissible">${msg}
    <button class="btn-close" onclick="this.parentElement.remove()"></button>
  </div>`;
}

async function loadEmails() {
  const res = await fetch(`${BASE}/emails`);
  const data = await res.json();
  const tbody = document.getElementById("emailTable");
  tbody.innerHTML = "";
  data.emails.forEach((e) => {
    tbody.innerHTML += `
      <tr>
        <td>${e.email}</td>
        <td class="text-center">
          <label class="switch">
            <input type="checkbox" data-id="${e.id}" ${
      e.is_active ? "checked" : ""
    }>
            <span class="slider"></span>
          </label>
        </td> 
        <td class="text-center">
          <button class="btn btn-danger btn-sm" data-id="${e.id}">Hapus</button>
        </td>
      </tr>`;
  });
  // attach listeners
  document.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => toggleEmail(cb.dataset.id, cb.checked));
  });
  document.querySelectorAll("button.btn-danger").forEach((btn) => {
    btn.addEventListener("click", () => deleteEmail(btn.dataset.id));
  });
}

async function toggleEmail(id, isActive) {
  await fetch(`${BASE}/emails/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive }),
  });
  showAlert("Status diperbarui", "info");
}

async function deleteEmail(id) {
  if (!confirm("Yakin ingin menghapus email ini?")) return;
  await fetch(`${BASE}/emails/${id}`, { method: "DELETE" });
  showAlert("Email dihapus", "warning");
  loadEmails();
}

document
  .getElementById("formAddEmail")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const address = document.getElementById("inputEmail").value.trim();
    await fetch(`${BASE}/emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address }),
    })
      .then((res) =>
        res.json().then((j) => {
          if (res.ok) showAlert(j.message);
          else throw j;
        })
      )
      .catch((err) => showAlert(err.error, "danger"));
    document.getElementById("inputEmail").value = "";
    loadEmails();
  });

loadEmails();
