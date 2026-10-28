# Paths
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.cargo/bin:$PATH"
export PATH="$HOME/google-cloud-sdk/bin:$PATH"

# Node Version Manager
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"

# Command history
HISTFILE="$HOME/.zsh_history"
HISTSIZE=100000
SAVEHIST=100000
setopt APPEND_HISTORY
setopt INC_APPEND_HISTORY
setopt EXTENDED_HISTORY
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_SPACE
setopt SHARE_HISTORY

# Tab completion 
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'
autoload -Uz compinit
compinit

# Prompt
PROMPT='%n@%m:%~%# '

# Editor
export EDITOR='nvim'

# Aliases
alias ll='ls -lah'
alias ..='cd ..'
alias ...='cd ../..'
alias c='clear'
alias nv='neovide'

# Git aliases
alias gs='git status'
alias gd='git diff'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git pull'

export PATH=$PATH:/Users/arijit.nukala/.cargo/bin

# Up/Down arrow: search history by typed prefix
autoload -Uz up-line-or-beginning-search down-line-or-beginning-search
zle -N up-line-or-beginning-search
zle -N down-line-or-beginning-search
bindkey '^[[A' up-line-or-beginning-search
bindkey '^[OA' up-line-or-beginning-search
bindkey '^[[B' down-line-or-beginning-search
bindkey '^[OB' down-line-or-beginning-search

eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
 

# Added by LM Studio CLI (lms)
export PATH="$PATH:/Users/arijit.nukala/.lmstudio/bin"
# End of LM Studio CLI section

# Work-only shell setup
[[ -f ~/.zshrc.work ]] && source ~/.zshrc.work
