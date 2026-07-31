const plan = await fetch("/base-agent-evidence-operator-plan.json", { cache: "no-store" }).then(response => response.json());
const confirmed = plan.confirmed_record?.replay_lock === "confirmed_event_root_nonzero";
const record = document.getElementById("record");

if (confirmed && record) {
  const lock = () => {
    record.disabled = true;
    record.textContent = "Evidence record replay-locked";
  };
  document.addEventListener("click", event => {
    if (event.target === record) {
      event.preventDefault();
      event.stopImmediatePropagation();
      lock();
    }
  }, true);
  new MutationObserver(lock).observe(record, { attributes: true, childList: true, subtree: true });
  lock();
}
