/**
 * A CDK portal implementation to wrap wp-edit-fields in non-angular contexts.
 */
import {WorkPackageEditFieldHandler} from "core-components/wp-edit-form/work-package-edit-field-handler";
import {WorkPackageEditForm} from "core-components/wp-edit-form/work-package-edit-form";
import {ApplicationRef, ComponentFactoryResolver, Injectable, Injector} from "@angular/core";
import {ComponentPortal, DomPortalOutlet} from "@angular/cdk/portal";
import {EditFormPortalComponent} from "core-app/modules/fields/edit/editing-portal/edit-form-portal.component";
import {createLocalInjector} from "core-app/modules/fields/edit/editing-portal/edit-form-portal.injector";
import {take} from "rxjs/operators";
import {IFieldSchema} from "core-app/modules/fields/field.base";
import {PathHelperService} from "core-app/modules/common/path-helper/path-helper.service";

@Injectable()
export class WorkPackageEditingPortalService {

  constructor(private readonly appRef:ApplicationRef,
              private readonly componentFactoryResolver:ComponentFactoryResolver,
              private readonly pathHelper:PathHelperService) {

  }

  public create(container:HTMLElement,
                injector:Injector,
                form:WorkPackageEditForm,
                schema:IFieldSchema,
                fieldName:string,
                errors:string[]):Promise<WorkPackageEditFieldHandler> {

    // Create the portal outlet
    const outlet = this.createDomOutlet(container, injector);

    // Create a field handler for the newly active field
    const fieldHandler = new WorkPackageEditFieldHandler(
      injector,
      form,
      fieldName,
      schema,
      container,
      this.pathHelper,
      errors
    );

    fieldHandler
      .onDestroy
      .pipe(take(1))
      // Don't call .dispose() on the outlet, it destroys the DOM element
      .subscribe(() => outlet.detach());

    // Create an injector that contains injectable reference to the edit field and handler
    const localInjector = createLocalInjector(injector, form.change, fieldHandler, schema);

    // Create a portal for the edit-form/field
    const portal = new ComponentPortal(EditFormPortalComponent, null, localInjector);

    // Clear the container
    container.innerHTML = '';

    // Attach the portal to the outlet
    const ref = outlet.attachComponentPortal(portal);

    // Wait until the content is initialized
    return ref
      .instance
      .onEditFieldReady
      .pipe(
        take(1)
      )
      .toPromise()
      .then(() => fieldHandler);
  }

  /**
   * Creates a dom outlet for attaching the portal.
   *
   * @param {HTMLElement} hostElement The element where the portal will be attached into
   * @returns {DomPortalOutlet}
   */
  private createDomOutlet(hostElement:HTMLElement, injector:Injector) {
    return new DomPortalOutlet(
      hostElement,
      this.componentFactoryResolver,
      this.appRef,
      injector
    );
  }
}


