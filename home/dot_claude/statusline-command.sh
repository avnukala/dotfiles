#!/bin/bash
input=$(cat)
echo "$input" | jq -j '
  def k: if . >= 1000 then "\(. / 1000 | floor)k" else "\(.)" end;
  (.workspace.current_dir // .cwd // "") as $d
  | [ ([.model.display_name, .effort.level] | map(select(. != null)) | join(" ")),
      ($d | sub("^" + env.HOME; "~")),
      (if .context_window.remaining_percentage != null then "\(.context_window.remaining_percentage | floor)% left" else empty end),
      (if .context_window.total_input_tokens != null then "in \(.context_window.total_input_tokens | k)" else empty end),
      (if .context_window.total_output_tokens != null then "out \(.context_window.total_output_tokens | k)" else empty end),
      (if .cost.total_cost_usd != null then "$\(.cost.total_cost_usd * 100 | round / 100)" else empty end)
    ] | map(select(. != "")) | join(" * ")' 2>/dev/null
