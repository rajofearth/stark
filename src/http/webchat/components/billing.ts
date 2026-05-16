/* Billing view — main column (minimal plan; metrics, chart, table) */

export function renderBillingPanel(): string {
  return `
<div id="view-billing" class="view-panel view-hidden" aria-hidden="true">
  <div class="billing-scroll">
    <div class="billing-header">
      <div>
        <h1 class="billing-title">Billing</h1>
        <p class="billing-sub">Usage and estimated cost from Codex webchat (server ledger).</p>
      </div>
      <div class="billing-header-actions">
        <span id="billing-range-label" class="billing-range-label"></span>
        <button type="button" class="hdr-btn" id="billing-refresh-btn">Refresh</button>
      </div>
    </div>

    <div class="billing-chips" id="billing-chips">
      <button type="button" class="billing-chip" data-preset="1d">1d</button>
      <button type="button" class="billing-chip" data-preset="7d">7d</button>
      <button type="button" class="billing-chip active" data-preset="30d">30d</button>
      <button type="button" class="billing-chip" data-preset="mtd">MTD</button>
      <button type="button" class="billing-chip" data-preset="lastmonth">Last month</button>
    </div>

    <div class="billing-controls">
      <label class="billing-select-wrap">Group by
        <select id="billing-group-model" class="billing-select">
          <option value="">All models</option>
        </select>
      </label>
      <label class="billing-select-wrap">Metric
        <select id="billing-metric" class="billing-select">
          <option value="spend">Spend (USD)</option>
          <option value="tokens">Tokens</option>
        </select>
      </label>
    </div>

    <div class="billing-metrics">
      <div class="billing-card">
        <div class="billing-card-label">Total spend</div>
        <div class="billing-card-value" id="bill-m-total">—</div>
        <div class="billing-card-hint" id="bill-m-total-sub">Reported + estimated</div>
      </div>
      <div class="billing-card">
        <div class="billing-card-label">Total tokens</div>
        <div class="billing-card-value" id="bill-m-tokens">—</div>
        <div class="billing-card-hint">From ledger deltas</div>
      </div>
      <div class="billing-card">
        <div class="billing-card-label">Usage events</div>
        <div class="billing-card-value" id="bill-m-events">—</div>
        <div class="billing-card-hint">Rows in selected range</div>
      </div>
    </div>

    <section class="billing-section">
      <div class="billing-section-head">
        <div>
          <h2 class="billing-section-title">Your usage</h2>
          <p class="billing-section-sub">Cumulative trend over the selected range.</p>
        </div>
      </div>
      <div class="billing-chart-wrap" id="billing-chart-wrap">
        <svg id="billing-chart" class="billing-chart" viewBox="0 0 640 200" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="billing-chart-legend">
          <span class="billing-legend-item"><i class="dot dot-rep"></i> Reported</span>
          <span class="billing-legend-item"><i class="dot dot-est"></i> Estimated</span>
        </div>
      </div>
    </section>

    <section class="billing-section">
      <div class="billing-section-head">
        <div>
          <h2 class="billing-section-title">Usage history</h2>
          <p class="billing-section-sub">Per update when Codex reported higher cumulative usage.</p>
        </div>
        <a class="hdr-btn" id="billing-export-btn" href="#" download>Export CSV</a>
      </div>
      <div class="billing-table-wrap">
        <table class="billing-table" id="billing-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Model</th>
              <th>Description</th>
              <th class="num">Tokens</th>
              <th class="num">Cost</th>
            </tr>
          </thead>
          <tbody id="billing-tbody"></tbody>
        </table>
      </div>
      <div class="billing-pager" id="billing-pager">
        <span id="billing-pager-info"></span>
        <div class="billing-pager-btns" id="billing-pager-btns"></div>
      </div>
    </section>
  </div>
</div>`;
}
