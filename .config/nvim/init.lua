-- bootstrap lazy
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.uv.fs_stat(lazypath) then
  vim.fn.system({
    "git", "clone", "--filter=blob:none", "--branch=stable",
    "https://github.com/folke/lazy.nvim.git", lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- disable netrw
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1
vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- options
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.termguicolors = true
vim.opt.expandtab = true
vim.opt.shiftwidth = 2
vim.opt.tabstop = 2
vim.opt.smartindent = true
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.clipboard = "unnamedplus"
vim.opt.signcolumn = "yes"
vim.opt.cursorline = true
vim.opt.scrolloff = 8
vim.opt.splitright = true
vim.opt.splitbelow = true
vim.opt.undofile = true
vim.opt.updatetime = 250
vim.opt.completeopt = { "menu", "menuone", "noselect", "popup" }

-- language servers
local servers = { "rust_analyzer", "ts_ls", "pyright", "html" }

-- lualine filename with modified / readonly / new status
local filename = {
  "filename",
  path = 1,
  file_status = true,
  newfile_status = true,
  symbols = { modified = "[+]", readonly = "[-]", unnamed = "[No Name]", newfile = "[New]" },
}

-- plugins
require("lazy").setup({
  -- file tree
  {
    "nvim-tree/nvim-tree.lua",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    opts = {
      view = { width = 50, preserve_window_proportions = true },
      filters = { dotfiles = false },
      hijack_directories = { enable = false }, -- alpha handles `nvim <dir>`
      update_focused_file = { enable = true }, -- follow the current buffer
    },
    init = function()
      vim.o.equalalways = false
      -- open the tree on the current file when a real file is opened
      vim.api.nvim_create_autocmd("BufWinEnter", {
        callback = function(a)
          if vim.bo[a.buf].buftype ~= "" or a.file == "" then return end
          local api = require("nvim-tree.api")
          if not api.tree.is_visible() then
            api.tree.open({ find_file = true, focus = false })
          end
        end,
      })
    end,
  },

  -- landing screen
  {
    "goolord/alpha-nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    config = function()
      local dashboard = require("alpha.themes.dashboard")
      dashboard.section.buttons.val = {
        dashboard.button("f", "  Find file", ":Telescope find_files<CR>"),
        dashboard.button("g", "  Live grep", ":Telescope live_grep<CR>"),
        dashboard.button("r", "  Recent files", ":Telescope oldfiles<CR>"),
        dashboard.button("e", "  File tree", ":NvimTreeOpen<CR>"),
        dashboard.button("n", "  New file", ":ene <BAR> startinsert<CR>"),
        dashboard.button("l", "󰒲  Lazy", ":Lazy<CR>"),
        dashboard.button("q", "  Quit", ":qa<CR>"),
      }
      require("alpha").setup(dashboard.config)

      -- `nvim <folder>`: cd into it and show the landing screen
      vim.api.nvim_create_autocmd("VimEnter", {
        callback = function()
          if vim.fn.argc() ~= 1 then return end
          local arg = vim.fn.argv(0)
          if vim.fn.isdirectory(arg) == 0 then return end
          vim.cmd.cd(vim.fn.fnameescape(arg))
          local buf = vim.api.nvim_get_current_buf()
          require("alpha").start(false)
          if buf ~= vim.api.nvim_get_current_buf() then
            pcall(vim.api.nvim_buf_delete, buf, { force = true })
          end
        end,
      })
    end,
  },

  -- telescope
  {
    "nvim-telescope/telescope.nvim",
    branch = "master",
    dependencies = {
      "nvim-lua/plenary.nvim",
      { "nvim-telescope/telescope-fzf-native.nvim", build = "make", cond = vim.fn.executable("make") == 1 },
    },
    config = function()
      require("telescope").setup({
        defaults = {
          file_ignore_patterns = { "*.tmp/" },
          mappings = {
            i = {
              ["<C-n>"] = function(...) return require("telescope.actions").cycle_history_next(...) end,
              ["<C-p>"] = function(...) return require("telescope.actions").cycle_history_prev(...) end,
            },
          },
        },
      })
      pcall(require("telescope").load_extension, "fzf")
    end,
  },

  -- treesitter
  {
    "nvim-treesitter/nvim-treesitter",
    branch = "main",
    lazy = false,
    build = ":TSUpdate",
    config = function()
      local ts = require("nvim-treesitter")
      ts.install({
        "lua", "vim", "vimdoc", "query", "regex", "diff", "gitcommit",
        "bash", "json", "yaml", "toml", "markdown", "markdown_inline",
        "javascript", "typescript", "tsx", "html", "css", "python", "rust",
      })
      vim.api.nvim_create_autocmd("FileType", {
        callback = function(a)
          if pcall(vim.treesitter.start, a.buf) then
            vim.bo[a.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
          end
        end,
      })
    end,
  },

  -- lsp
  { "neovim/nvim-lspconfig" },
  { "mason-org/mason.nvim", opts = {} },
  {
    "mason-org/mason-lspconfig.nvim",
    dependencies = { "mason-org/mason.nvim", "neovim/nvim-lspconfig" },
    opts = { ensure_installed = servers, automatic_enable = false },
  },
  {
    "WhoIsSethDaniel/mason-tool-installer.nvim",
    dependencies = { "mason-org/mason.nvim" },
    opts = { ensure_installed = { "prettierd" } },
  },

  -- formatting
  {
    "stevearc/conform.nvim",
    opts = {
      formatters_by_ft = {
        javascript = { "prettierd" },
        typescript = { "prettierd" },
        javascriptreact = { "prettierd" },
        typescriptreact = { "prettierd" },
        json = { "prettierd" },
        jsonc = { "prettierd" },
        html = { "prettierd" },
        css = { "prettierd" },
        scss = { "prettierd" },
        yaml = { "prettierd" },
        markdown = { "prettierd" },
      },
      format_on_save = { timeout_ms = 1000, lsp_format = "fallback" },
    },
  },

  -- git blame
  {
    "f-person/git-blame.nvim",
    opts = {
      enabled = true,
      message_template = "  <author> • <date> • <summary>",
      date_format = "%r",
    },
  },

  -- live markdown preview in browser
  {
    "iamcco/markdown-preview.nvim",
    ft = { "markdown" },
    build = "cd app && npx --yes yarn install --frozen-lockfile",
    init = function()
      vim.g.mkdp_filetypes = { "markdown" }
      vim.g.mkdp_auto_close = 1
    end,
  },

  -- statusline
  {
    "nvim-lualine/lualine.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    opts = {
      options = {
        theme = "auto",
        globalstatus = false,
        component_separators = "|",
        section_separators = "",
      },
      sections = {
        lualine_b = { "branch", "diff", "diagnostics" },
        lualine_c = { filename },
      },
      inactive_sections = {
        lualine_c = { filename },
      },
      extensions = { "nvim-tree", "lazy", "mason" },
    },
  },

  -- themes
  { "rose-pine/neovim", name = "nightfox", priority = 1000 },
  { "EdenEast/nightfox.nvim" },
  { "rebelot/kanagawa.nvim" },
  { "folke/tokyonight.nvim" },
  { "tiagovla/tokyodark.nvim" },
})

pcall(vim.cmd.colorscheme, "kanagawa-dragon")

-- lsp
vim.lsp.enable(servers)

vim.diagnostic.config({
  virtual_text = { spacing = 2, prefix = "●" },
  severity_sort = true,
  float = { border = "rounded", source = true },
})

-- nvim autocompletion triggered by letter
vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(ev)
    local client = vim.lsp.get_client_by_id(ev.data.client_id)
    if not client or not client:supports_method("textDocument/completion") then return end

    local provider = client.server_capabilities.completionProvider
    if provider then
      provider.triggerCharacters = provider.triggerCharacters or {}
      for c in ("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"):gmatch(".") do
        table.insert(provider.triggerCharacters, c)
      end
    end
    vim.lsp.completion.enable(true, client.id, ev.buf, { autotrigger = true })
  end,
})

-- keymaps
local map = vim.keymap.set
local s = { silent = true }

-- general
map("i", "jk", "<Esc>", s)
map("i", "kj", "<Esc>", s)
map("n", "<Esc>", ":nohlsearch<CR>", s)

-- windows
map("n", "<C-h>", "<C-w>h", s)
map("n", "<C-j>", "<C-w>j", s)
map("n", "<C-k>", "<C-w>k", s)
map("n", "<C-l>", "<C-w>l", s)
map("n", "<C-\\>", ":vsplit<CR>", s)
map("n", "<leader>v", ":vsplit<CR>", s)
map("n", "<leader>-", ":split<CR>", s)

-- file tree
map("n", "<leader>e", ":NvimTreeToggle<CR>", s)

-- telescope
map("n", "<leader>ff", ":Telescope find_files<CR>", s)
map("n", "<leader>fg", ":Telescope live_grep<CR>", s)
map("n", "<leader>fb", ":Telescope buffers<CR>", s)
map("n", "<leader>fh", ":Telescope help_tags<CR>", s)
map("n", "<leader>fr", ":Telescope oldfiles<CR>", s)
map("n", "<leader>fd", ":Telescope diagnostics<CR>", s)
map("n", "<leader>fs", ":Telescope lsp_document_symbols<CR>", s)

-- lsp
map("n", "gd", vim.lsp.buf.definition, s)
map("n", "gD", vim.lsp.buf.declaration, s)
map("n", "<leader>rn", vim.lsp.buf.rename, s)
map({ "n", "v" }, "<leader>ca", vim.lsp.buf.code_action, s)
map("n", "<leader>d", vim.diagnostic.open_float, s)

-- formatting
map({ "n", "v" }, "<leader>cf", function()
  require("conform").format({ async = true, lsp_format = "fallback" })
end, s)

-- git blame
map("n", "<leader>gb", ":GitBlameToggle<CR>", s)
map("n", "<leader>go", ":GitBlameOpenCommitURL<CR>", s)

-- markdown preview
map("n", "<leader>mp", ":MarkdownPreviewToggle<CR>", s)

-- neovide 
if vim.g.neovide then
  vim.g.neovide_cursor_animation_length = 0.05
  vim.g.cursor_trail_size = 0.1
  vim.g.neovide_scroll_animation_length = 0.2
  vim.g.neovide_text_gamma = 0.8
  vim.g.neovide_text_contrast = 0.1
end
