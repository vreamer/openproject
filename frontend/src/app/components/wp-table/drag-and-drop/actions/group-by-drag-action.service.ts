import {WorkPackageResource} from "core-app/modules/hal/resources/work-package-resource";
import {TableDragActionService} from "core-components/wp-table/drag-and-drop/actions/table-drag-action.service";
import {WorkPackageViewGroupByService} from "core-app/modules/work_packages/routing/wp-view-base/view-services/wp-view-group-by.service";
import {WorkPackageEditingService} from "core-components/wp-edit-form/work-package-editing-service";
import {rowGroupClassName} from "core-components/wp-fast-table/builders/modes/grouped/grouped-classes.constants";
import {locatePredecessorBySelector} from "core-components/wp-fast-table/helpers/wp-table-row-helpers";
import {groupIdentifier} from "core-components/wp-fast-table/builders/modes/grouped/grouped-rows-helpers";
import {WorkPackageNotificationService} from "core-components/wp-edit/wp-notification.service";

export class GroupByDragActionService extends TableDragActionService {

  private wpTableGroupBy = this.injector.get(WorkPackageViewGroupByService);
  private wpEditing = this.injector.get<WorkPackageEditingService>(WorkPackageEditingService);
  private wpNotifications = this.injector.get(WorkPackageNotificationService);

  public get applies() {
    return this.wpTableGroupBy.isEnabled;
  }

  /**
   * Returns whether the given work package is movable
   */
  public canPickup(workPackage:WorkPackageResource):boolean {
    const attribute = this.groupedAttribute;
    return attribute !== null && workPackage.isAttributeEditable(attribute);
  }

  public handleDrop(workPackage:WorkPackageResource, el:HTMLElement):Promise<unknown> {
    const changeset = this.wpEditing.changeFor(workPackage);
    const groupedValue = this.getValueForGroup(el);

    changeset.projectedResource[this.groupedAttribute!] = groupedValue;
    return this.wpEditing
      .save(changeset)
      .catch(e => this.wpNotifications.handleRawError(e, workPackage));
  }

  private getValueForGroup(el:HTMLElement):unknown|null {
    const groupHeader = locatePredecessorBySelector(el, `.${rowGroupClassName}`)!;
    const match = this.groups.find(group => groupIdentifier(group) === groupHeader.dataset.groupIdentifier);

    if (!match) {
      return null;
    }

    if (match._links && match._links.valueLink) {
      const links = match._links.valueLink;

      // Unwrap single links to properly use them
      return links.length === 1 ? links[0] : links;
    } else {
      return match.value;
    }
  }

  /**
   * Get the attribute we're grouping by
   */
  private get groupedAttribute():string|null {
    const current = this.wpTableGroupBy.current;
    return current ? current.id : null;
  }

  /**
   * Returns the reference to the last table.groups state value
   */
  public get groups() {
    return this.querySpace.groups.value || [];
  }
}
