import type { Preview } from "@storybook/react-vite";
import "../src/styles/index.css";

const preview: Preview = {
  decorators: [(Story) => <div className="bg-bg p-4 text-ink"><Story /></div>],
  parameters: { layout: "fullscreen" },
};
export default preview;
