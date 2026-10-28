# PR images

Use `gh image` to upload images and embed them in a PR, issue, or comment. The images stay private to the repository.

If `gh image` is not installed, install it: `gh extension install drogers0/gh-image`.

## Do not

- Do not commit images to a branch or a release.
- Do not link to a local file path.
- Do not print a session token or run `gh image extract-token`.
- Do not work around a permission denial on a PR edit. Tell the user.

## Upload and embed

1. Write the body first. Start from the existing body, because `--body-file` replaces it.
2. Put `![caption](./name.png)` where each image belongs.
3. In the folder that holds the images, run:

   ```bash
   gh image --repo owner/repo a.png b.png -- pr edit 123 -R owner/repo --body-file body.md
   ```

   `gh image` rewrites each `./name.png` to the uploaded URL and appends files the body does not mention. Write `./-name.png` for a name that starts with a dash.

To get markdown references only, run `gh image --repo owner/repo a.png`.

## Write the PR text

- Capture each visible state that the change affects.
- Put a caption before each image. State what the image proves.
- Put the images in the Validation section.
- Say what the image shows: real app, Storybook with mocked data, or fake data.

## Check the result

- Count uploads: `gh pr view 123 --json body --jq .body | grep -c user-attachments`.
- Ask the user to confirm that the images render. The CLI cannot check this.
