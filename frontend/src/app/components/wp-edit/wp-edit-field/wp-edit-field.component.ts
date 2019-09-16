// -- copyright
// OpenProject is a project management system.
// Copyright (C) 2012-2015 the OpenProject Foundation (OPF)
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
//
// See doc/COPYRIGHT.rdoc for more details.
// ++

import {WorkPackageResource} from 'core-app/modules/hal/resources/work-package-resource';
import {WorkPackageCacheService} from '../../work-packages/work-package-cache.service';
import {WorkPackageNotificationService} from '../wp-notification.service';
import {States} from '../../states.service';
import {
  displayClassName,
  DisplayFieldRenderer,
  editFieldContainerClass
} from '../../wp-edit-form/display-field-renderer';
import {WorkPackageEditingService} from '../../wp-edit-form/work-package-editing-service';
import {SelectionHelpers} from '../../../helpers/selection-helpers';
import {debugLog} from '../../../helpers/debug_output';
import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component,
  ElementRef,
  Inject,
  Injector,
  Input, OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import {WorkPackageEditFieldGroupComponent} from 'core-components/wp-edit/wp-edit-field/wp-edit-field-group.directive';
import {ConfigurationService} from 'core-app/modules/common/config/configuration.service';
import {OPContextMenuService} from "core-components/op-context-menu/op-context-menu.service";
import {NotificationsService} from 'core-app/modules/common/notifications/notifications.service';
import {I18nService} from 'core-app/modules/common/i18n/i18n.service';
import {IFieldSchema} from "core-app/modules/fields/field.base";
import {ClickPositionMapper} from "core-app/modules/common/set-click-position/set-click-position";

@Component({
  selector: 'wp-edit-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wp-edit-field.html'
})
export class WorkPackageEditFieldComponent implements OnInit, OnDestroy {
  @Input('fieldName') public fieldName:string;
  @Input('workPackageId') public workPackageId:string;
  @Input('wrapperClasses') public wrapperClasses?:string;
  @Input('displayFieldOptions') public displayFieldOptions:any = {};
  @Input('displayPlaceholder') public displayPlaceholder?:string;
  @Input('isDropTarget') public isDropTarget?:boolean = false;

  @ViewChild('displayContainer', { static: true }) readonly displayContainer:ElementRef;
  @ViewChild('editContainer', { static: true }) readonly editContainer:ElementRef;

  public workPackage:WorkPackageResource;
  public fieldRenderer:DisplayFieldRenderer;
  public editFieldContainerClass = editFieldContainerClass;
  public active = false;
  private $element:JQuery;

  public destroyed:boolean = false;

  constructor(protected states:States,
              protected injector:Injector,
              protected elementRef:ElementRef,
              protected wpNotificationsService:WorkPackageNotificationService,
              protected ConfigurationService:ConfigurationService,
              protected opContextMenu:OPContextMenuService,
              protected wpEditing:WorkPackageEditingService,
              protected wpCacheService:WorkPackageCacheService,
              // Get parent field group from injector
              protected wpEditFieldGroup:WorkPackageEditFieldGroupComponent,
              protected NotificationsService:NotificationsService,
              protected cdRef:ChangeDetectorRef,
              protected I18n:I18nService) {

  }

  public setActive(active:boolean = true) {
    this.active = active;
    if (!this.destroyed) {
      this.cdRef.detectChanges();
    }
  }

  public ngOnInit() {
    this.fieldRenderer = new DisplayFieldRenderer(this.injector, 'single-view', this.displayFieldOptions);
    this.$element = jQuery(this.elementRef.nativeElement);
    this.wpEditFieldGroup.register(this);
  }

  public ngOnDestroy() {
    this.destroyed = true;
  }

  // Open the field when its closed and relay drag & drop events to it.
  public startDragOverActivation(event:JQuery.TriggeredEvent) {
    if (!this.isDropTarget || !this.isEditable || this.active) {
      return true;
    }

    this.handleUserActivate(null);
    event.preventDefault();
    return false;
  }

  public render() {
    const el = this.fieldRenderer.render(this.resource, this.fieldName, null, this.displayPlaceholder);
    this.displayContainer.nativeElement.innerHTML = '';
    this.displayContainer.nativeElement.appendChild(el);
  }

  public deactivate(focus:boolean = false) {
    this.editContainer.nativeElement.innerHTML = '';
    this.editContainer.nativeElement.hidden = true;
    this.setActive(false);

    if (focus) {
      setTimeout(() => this.$element.find(`.${displayClassName}`).focus(), 20);
    }
  }

  public get resource() {
    return this.wpEditing
      .temporaryEditResource(this.workPackageId)
      .getValueOr(this.workPackage);
  }

  public get isEditable() {
    const fieldSchema = this.resource.schema[this.fieldName] as IFieldSchema;
    return this.resource.isAttributeEditable(this.fieldName) && fieldSchema && fieldSchema.writable;
  }

  public activateIfEditable(event:JQuery.TriggeredEvent) {
    // Ignore selections
    if (SelectionHelpers.hasSelectionWithin(event.target)) {
      debugLog(`Not activating ${this.fieldName} because of active selection within`);
      return true;
    }

    // Skip activation if the user clicked on a link or within a macro
    const target = jQuery(event.target);
    if (target.closest('a,macro', this.displayContainer.nativeElement).length > 0) {
      return true;
    }

    if (this.isEditable) {
      this.handleUserActivate(event);
    }

    this.opContextMenu.close();
    event.preventDefault();
    event.stopImmediatePropagation();

    return false;
  }

  public overflowingSelector() {
    return this.$element
      .closest('.attributes-group')
      .data ('groupIdentifier');
  }

  public activateOnForm(noWarnings:boolean = false) {
    // Activate the field
    this.setActive(true);

    return this.wpEditFieldGroup.form
      .activate(this.fieldName, noWarnings)
      .catch(() => this.deactivate(true));
  }

  public handleUserActivate(evt:JQuery.TriggeredEvent|null) {
    let positionOffset = 0;

    if (evt) {
      // Get the position where the user clicked.
      positionOffset = ClickPositionMapper.getPosition(evt);
    }

    this.activateOnForm()
      .then((handler) => {
        if (!handler) {
          return;
        }

        handler.$onUserActivate.next();
        handler.focus(positionOffset);
      });

    return false;
  }

  public reset(workPackage:WorkPackageResource) {
    this.workPackage = workPackage;
    this.render();

    this.deactivate();
  }

}
