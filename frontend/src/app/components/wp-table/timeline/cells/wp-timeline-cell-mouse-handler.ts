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

import {Injector} from '@angular/core';
import * as moment from 'moment';
import {WorkPackageCacheService} from '../../../work-packages/work-package-cache.service';
import {WorkPackageNotificationService} from '../../../wp-edit/wp-notification.service';
import {WorkPackageTimelineTableController} from '../container/wp-timeline-container.directive';
import {RenderInfo} from '../wp-timeline';
import {TimelineCellRenderer} from './timeline-cell-renderer';
import {WorkPackageCellLabels} from './wp-timeline-cell';
import {IsolatedQuerySpace} from "core-app/modules/work_packages/query-space/isolated-query-space";
import {QueryDmService} from 'core-app/modules/hal/dm-services/query-dm.service';
import {keyCodes} from 'core-app/modules/common/keyCodes.enum';
import {LoadingIndicatorService} from "core-app/modules/common/loading-indicator/loading-indicator.service";
import {WorkPackageEditingService} from 'core-app/components/wp-edit-form/work-package-editing-service';
import {WorkPackageChangeset} from "core-components/wp-edit/work-package-changeset";
import {WorkPackageEventsService} from "core-app/modules/work_packages/events/work-package-events.service";
import Moment = moment.Moment;

export const classNameBar = 'bar';
export const classNameLeftHandle = 'leftHandle';
export const classNameRightHandle = 'rightHandle';
export const classNameBarLabel = 'bar-label';


export function registerWorkPackageMouseHandler(this:void,
                                                injector:Injector,
                                                getRenderInfo:() => RenderInfo,
                                                workPackageTimeline:WorkPackageTimelineTableController,
                                                wpCacheService:WorkPackageCacheService,
                                                wpEditing:WorkPackageEditingService,
                                                wpEvents:WorkPackageEventsService,
                                                wpNotificationsService:WorkPackageNotificationService,
                                                loadingIndicator:LoadingIndicatorService,
                                                cell:HTMLElement,
                                                bar:HTMLDivElement,
                                                labels:WorkPackageCellLabels,
                                                renderer:TimelineCellRenderer,
                                                renderInfo:RenderInfo) {

  const querySpace:IsolatedQuerySpace = injector.get(IsolatedQuerySpace);

  let mouseDownStartDay:number | null = null; // also flag to signal active drag'n'drop
  renderInfo.change = wpEditing.changeFor(renderInfo.workPackage);

  let dateStates:any;
  let placeholderForEmptyCell:HTMLElement;
  const jBody = jQuery('body');

  // handles change to existing work packages
  bar.onmousedown = (ev:MouseEvent) => {
    if (ev.which === 1) {
      // Left click only
      workPackageMouseDownFn(bar, ev);
    }
  };

  // handles initial creation of start/due values
  cell.onmousemove = handleMouseMoveOnEmptyCell;

  function applyDateValues(renderInfo:RenderInfo, dates:{ [name:string]:Moment }) {
    // Let the renderer decide which fields we change
    renderer.assignDateValues(renderInfo.change, labels, dates);
  }

  function getCursorOffsetInDaysFromLeft(renderInfo:RenderInfo, ev:MouseEvent) {
    const leftOffset = workPackageTimeline.getAbsoluteLeftCoordinates();
    const cursorOffsetLeftInPx = ev.clientX - leftOffset;
    const cursorOffsetLeftInDays = Math.floor(cursorOffsetLeftInPx / renderInfo.viewParams.pixelPerDay);
    return cursorOffsetLeftInDays;
  }

  function workPackageMouseDownFn(bar:HTMLDivElement, ev:MouseEvent) {
    ev.preventDefault();

    // add/remove css class while drag'n'drop is active
    const classNameActiveDrag = 'active-drag';
    bar.classList.add(classNameActiveDrag);
    jBody.on('mouseup.timelinecell', () => bar.classList.remove(classNameActiveDrag));

    workPackageTimeline.disableViewParamsCalculation = true;
    mouseDownStartDay = getCursorOffsetInDaysFromLeft(renderInfo, ev);

    // If this wp is a parent element, changing it is not allowed.
    // But adding a relation to it is.
    if (!renderInfo.workPackage.isLeaf && !renderInfo.viewParams.activeSelectionMode) {
      return;
    }

    // Determine what attributes of the work package should be changed
    const direction = renderer.onMouseDown(ev, null, renderInfo, labels, bar);

    jBody.on('mousemove.timelinecell', createMouseMoveFn(direction));
    jBody.on('keyup.timelinecell', keyPressFn);
    jBody.on('mouseup.timelinecell', () => deactivate(false));
  }

  function createMouseMoveFn(direction:'left'|'right'|'both'|'create'|'dragright') {
    return (ev:JQuery.MouseMoveEvent) => {

      const days = getCursorOffsetInDaysFromLeft(renderInfo, ev.originalEvent!) - mouseDownStartDay!;
      const offsetDayCurrent = Math.floor(ev.offsetX / renderInfo.viewParams.pixelPerDay);
      const dayUnderCursor = renderInfo.viewParams.dateDisplayStart.clone().add(offsetDayCurrent, 'days');

      dateStates = renderer.onDaysMoved(renderInfo.change, dayUnderCursor, days, direction);
      applyDateValues(renderInfo, dateStates);
      renderer.update(bar, labels, renderInfo);
    };
  }

  function keyPressFn(ev:JQuery.TriggeredEvent) {
    const kev:KeyboardEvent = ev as any;
    if (kev.keyCode === keyCodes.ESCAPE) {
      deactivate(true);
    }
  }

  function handleMouseMoveOnEmptyCell(ev:MouseEvent) {
    const wp = renderInfo.workPackage;

    if (!renderer.isEmpty(wp)) {
      return;
    }

    if (!(wp.isLeaf && renderer.canMoveDates(wp))) {
      cell.style.cursor = 'not-allowed';
      return;
    }

    // placeholder logic
    cell.style.cursor = '';
    placeholderForEmptyCell && placeholderForEmptyCell.remove();
    placeholderForEmptyCell = renderer.displayPlaceholderUnderCursor(ev, renderInfo);
    cell.appendChild(placeholderForEmptyCell);

    // abort if mouse leaves cell
    cell.onmouseleave = () => {
      placeholderForEmptyCell.remove();
    };

    // create logic
    cell.onmousedown = (ev) => {
      placeholderForEmptyCell.remove();
      bar.style.pointerEvents = 'none';
      ev.preventDefault();

      const offsetDayStart = Math.floor(ev.offsetX / renderInfo.viewParams.pixelPerDay);
      const clickStart = renderInfo.viewParams.dateDisplayStart.clone().add(offsetDayStart, 'days');
      const dateForCreate = clickStart.format('YYYY-MM-DD');
      const mouseDownType = renderer.onMouseDown(ev, dateForCreate, renderInfo, labels, bar);
      renderer.update(bar, labels, renderInfo);

      if (mouseDownType === 'create') {
        deactivate(false);
        ev.preventDefault();
        return;
      }

      cell.onmousemove = (ev) => {
        const offsetDayCurrent = Math.floor(ev.offsetX / renderInfo.viewParams.pixelPerDay);
        const dayUnderCursor = renderInfo.viewParams.dateDisplayStart.clone().add(offsetDayCurrent, 'days');
        const widthInDays = offsetDayCurrent - offsetDayStart;
        const moved = renderer.onDaysMoved(renderInfo.change, dayUnderCursor, widthInDays, mouseDownType);
        renderer.assignDateValues(renderInfo.change, labels, moved);
        renderer.update(bar, labels, renderInfo);
      };

      cell.onmouseleave = () => {
        deactivate(true);
      };

      cell.onmouseup = () => {
        deactivate(false);
      };

      jBody.on('keyup.timelinecell', keyPressFn);
    };
  }

  function deactivate(cancelled:boolean) {
    workPackageTimeline.disableViewParamsCalculation = false;

    cell.onmousemove = handleMouseMoveOnEmptyCell;
    cell.onmousedown = _.noop;
    cell.onmouseleave = _.noop;
    cell.onmouseup = _.noop;

    bar.style.pointerEvents = 'auto';

    jBody.off('.timelinecell');
    workPackageTimeline.resetCursor();
    mouseDownStartDay = null;
    dateStates = {};

    // const renderInfo = getRenderInfo();
    if (cancelled || renderInfo.change.isEmpty()) {
      renderInfo.change.clear();
      renderer.update(bar, labels, renderInfo);
      renderer.onMouseDownEnd(labels, renderInfo.change);
      workPackageTimeline.refreshView();
    } else {
      const stopAndRefresh = () => {
        renderInfo.change.clear();
        renderer.onMouseDownEnd(labels, renderInfo.change);
        workPackageTimeline.refreshView();
      };

      // Persist the changes
      saveWorkPackage(renderInfo.change)
        .then(stopAndRefresh)
        .catch(stopAndRefresh);
    }

  }

  function saveWorkPackage(change:WorkPackageChangeset) {
    const queryDm:QueryDmService = injector.get(QueryDmService);

    // Remember the time before saving the work package to know which work packages to update
    const updatedAt = moment().toISOString();

    return loadingIndicator.table.promise = wpEditing.save(change)
      .then((result) => {
        wpNotificationsService.showSave(result.workPackage);
        const ids = _.map(querySpace.rendered.value!, row => row.workPackageId);
        loadingIndicator.table.promise =
          queryDm.loadIdsUpdatedSince(ids, updatedAt).then(workPackageCollection => {
            wpCacheService.updateWorkPackageList(workPackageCollection.elements);

            wpEvents.push({ type: 'updated', id: result.workPackage.id! });
          });
      })
      .catch((error) => {
        wpNotificationsService.handleRawError(error, renderInfo.workPackage);
      });
  }
}

