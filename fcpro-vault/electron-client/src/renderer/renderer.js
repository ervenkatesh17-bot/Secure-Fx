const statusEl = document.getElementById('status');
const activationForm = document.getElementById('activation-form');
const licenseInput = document.getElementById('license-key');
const deactivateButton = document.getElementById('deactivate');
const openProjectForm = document.getElementById('open-project-form');
const projectInput = document.getElementById('project-id');

function setStatus(message) {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

async function refreshActivation() {
  const state = await window.licenseAPI.checkActivation();

  if (state.activated) {
    setStatus(`Activated. Token expires at ${new Date(state.expiresAt * 1000).toLocaleString()}.`);
  } else {
    setStatus('Not activated.');
  }
}

activationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const key = licenseInput?.value.trim() ?? '';

  try {
    await window.licenseAPI.activate(key);
    setStatus('License activated.');
    await refreshActivation();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Activation failed.');
  }
});

deactivateButton?.addEventListener('click', async () => {
  await window.licenseAPI.deactivate();
  setStatus('License deactivated.');
});

openProjectForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const projectId = projectInput?.value.trim() ?? '';

  try {
    await window.licenseAPI.openProject(projectId);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Unable to open project.');
  }
});

window.licenseAPI.onProjectStatus((message) => {
  setStatus(message);
});

void refreshActivation();
