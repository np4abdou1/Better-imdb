## Plan: Combined Status Dropdown & Sleek Slider

I will combine the "To Watch", "Watching", "Watched" buttons into a single "Add to List" dropdown (reusing the `FilterDropdown` pattern) and refactor the rating slider into a sleek, dedicated component to reduce visual noise.

**Steps**

1.  **Create `StatusDropdown` Component**
    *   Create `components/StatusDropdown.tsx` by cloning and modifying `components/FilterDropdown.tsx`.
    *   Update the `Option` interface to support an optional `icon: ElementType` prop.
    *   Modify the render logic to display the icon alongside the label in both the button trigger and the dropdown menu.
    *   Adjust styling to match the primary action button style (white background for active state, transparent/bordered for inactive).

2.  **Create `RatingSlider` Component**
    *   Create `components/RatingSlider.tsx`.
    *   Move the `<input type="range">` and its logic from `app/title/[id]/page.tsx` to this new component.
    *   **Style Enhancements**:
        *   Reduce width from `w-full` to `w-32` or `max-w-[120px]` for a compact look.
        *   Reduce track height (e.g., `h-1`) and thumb size.
        *   Add a glowing effect or dynamic color (yellow) to the filled portion of the slider (using a linear-gradient background based on value).

3.  **Integrate Components into Title Page**
    *   In `app/title/[id]/page.tsx`:
        *   Import `StatusDropdown` and `RatingSlider`.
        *   Replace the mapped "To Watch"/"Watching"/"Watched" buttons with `<StatusDropdown />`.
        *   Pass `activeStatus` as the `value` and `handleStatusChange` as the `onChange` handler.
        *   Replace the inline range input with `<RatingSlider value={userRating} onChange={handleRate} />`.
    *   Clean up unused imports (`Monitor`, `Check`, `Plus` icons might need to be moved to the config or passed as props).

**Verification**
*   **Manual Check**: Navigate to a movie page (e.g., `/title/tt12345`).
*   **Dropdown**: Click "Add to List". Ensure dropdown opens. Select "Watching". Verify the button text changes to "Watching" and DB update triggers.
*   **Slider**: Interact with the new slider. standard rating functionality should persist but look visually smaller and sleeker.

**Decisions**
*   **New Component vs. Refactor**: Chose to create `StatusDropdown` instead of modifying `FilterDropdown` to avoid breaking existing filter panels that don't expect icons, and to allow specific "primary button" styling for the status action.
